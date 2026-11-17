import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { CollectionLabel } from '@hyrule/shared'

import type { DuplicateIndex } from './duplicate-index.ts'
import { buildImageFilename } from './filenames.ts'
import { perceptualHash, sha256 } from './hashing.ts'
import type { ImageLimits } from './image-validator.ts'
import { validateImage } from './image-validator.ts'
import { toRepoPath } from './local-images.ts'
import type { MetadataStore } from './metadata-store.ts'
import { rawSubcategoryDir } from './taxonomy.ts'
import type { ImageCandidate, ImageRecord, RejectionReason } from './types.ts'
import type { Downloaded } from './http-client.ts'

export interface CollectorDeps {
    download: (url: string) => Promise<Downloaded>
    store: MetadataStore
    index: DuplicateIndex
    rawDir: string
    repoRoot: string
    limits: ImageLimits
    now?: () => Date
    log?: (message: string) => void
}

export interface CollectOptions {
    /** Stop collecting a label once it has this many images (including images from earlier runs). */
    targets: Record<CollectionLabel, number>
    /** Replace a file that already exists at the destination. Off by default. */
    overwrite?: boolean
    /** Called after each candidate with what happened to it (e.g. to build a per-file import summary). */
    onOutcome?: (candidate: ImageCandidate, outcome: Outcome) => void
    /**
     * Save the metadata after this many new outcomes (and once at the end). 1 by default, so a run can be stopped
     * at any time. Big local imports use more: rewriting sources.json after every image gets slow.
     */
    saveEvery?: number
}

export type Outcome = 'kept' | 'skipped' | RejectionReason

export type CollectSummary = Record<Outcome, number>

/**
 * Downloads candidates one at a time (no concurrency: a few hundred images do not need it, and it keeps us
 * well inside the source's rate limits), validates them, drops duplicates, files them under
 * data/raw/<label>/<subcategory>/ and records their origin. Safe to interrupt and run again.
 */
export class DatasetCollector {
    private readonly deps: CollectorDeps
    private readonly now: () => Date
    private readonly log: (message: string) => void

    constructor(deps: CollectorDeps) {
        this.deps = deps
        this.now = deps.now ?? (() => new Date())
        this.log = deps.log ?? (() => {})
    }

    async collect(candidates: readonly ImageCandidate[], options: CollectOptions): Promise<CollectSummary> {
        const summary: Partial<CollectSummary> = {}
        const saveEvery = options.saveEvery ?? 1
        let unsaved = 0
        for (const candidate of candidates) {
            const target = options.targets[candidate.label]
            if (target !== Infinity && this.deps.store.countByLabel(candidate.label) >= target) continue
            const outcome = await this.collectOne(candidate, options.overwrite ?? false)
            summary[outcome] = (summary[outcome] ?? 0) + 1
            options.onOutcome?.(candidate, outcome)
            if (outcome !== 'skipped') {
                this.log(`${outcome.padEnd(16)} ${candidate.label}/${candidate.subcategory}  ${candidate.title}`)
                if (++unsaved >= saveEvery) {
                    await this.deps.store.save()
                    unsaved = 0
                }
            }
        }
        if (unsaved > 0) await this.deps.store.save()
        return summary as CollectSummary
    }

    private async collectOne(candidate: ImageCandidate, overwrite: boolean): Promise<Outcome> {
        const { store, index } = this.deps
        if (store.hasImage(candidate.url) || store.isPermanentlyRejected(candidate.url)) return 'skipped'

        let downloaded: Downloaded
        try {
            downloaded = await this.deps.download(candidate.downloadUrl ?? candidate.url)
        } catch (error) {
            return this.reject(candidate, 'download-failed', (error as Error).message)
        }
        if (downloaded.contentType.startsWith('text/')) {
            return this.reject(candidate, 'not-an-image', `Content-Type: ${downloaded.contentType}`)
        }

        const { buffer } = downloaded
        const validation = await validateImage(buffer, this.deps.limits)
        if (!validation.ok) return this.reject(candidate, validation.reason, validation.detail)

        const hash = sha256(buffer)
        let pHash: string
        try {
            pHash = await perceptualHash(buffer)
        } catch (error) {
            // Some damaged JPEGs pass the header check but fail when fully decoded.
            return this.reject(candidate, 'corrupted', (error as Error).message.split('\n')[0]!)
        }
        const duplicate = index.findDuplicate(hash, pHash)
        if (duplicate) {
            const reason = duplicate.kind === 'exact' ? 'duplicate-exact' : 'duplicate-near'
            return this.reject(candidate, reason, `of ${duplicate.ref} (distance ${duplicate.distance})`)
        }

        const filename = buildImageFilename(candidate, hash, validation.format)
        const dir = rawSubcategoryDir(candidate.label, candidate.subcategory, this.deps.rawDir)
        const file = path.join(dir, filename)
        const repoPath = toRepoPath(file, this.deps.repoRoot)

        // Reserve the hashes before the await, so nothing processed meanwhile can slip in as a duplicate.
        index.add({ sha256: hash, perceptualHash: pHash, ref: repoPath })
        try {
            await mkdir(dir, { recursive: true })
            // 'wx' fails if the file exists: never overwrite silently.
            await writeFile(file, buffer, { flag: overwrite ? 'w' : 'wx' })
        } catch (error) {
            index.remove(hash)
            if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
                return this.reject(
                    candidate,
                    'file-exists',
                    `${repoPath} exists; re-run with --overwrite to replace it`,
                )
            }
            throw error
        }

        const record: ImageRecord = {
            ...candidate,
            // A local path (archive extracted to a cache, file from the inbox) means nothing once imported.
            downloadUrl: candidate.downloadUrl?.startsWith('file:') ? undefined : candidate.downloadUrl,
            filename,
            path: repoPath,
            format: validation.format,
            width: validation.width,
            height: validation.height,
            bytes: buffer.length,
            sha256: hash,
            perceptualHash: pHash,
            downloadedAt: this.now().toISOString(),
        }
        store.addImage(record)
        return 'kept'
    }

    private reject(candidate: ImageCandidate, reason: RejectionReason, detail: string): RejectionReason {
        this.deps.store.addRejection({
            url: candidate.url,
            title: candidate.title,
            sourceName: candidate.sourceName,
            label: candidate.label,
            subcategory: candidate.subcategory,
            reason,
            detail,
            rejectedAt: this.now().toISOString(),
        })
        return reason
    }
}
