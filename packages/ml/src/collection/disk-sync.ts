import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { isClassLabel } from '@hyrule/shared'

import { sha256 } from './hashing.ts'
import { listImageFiles, toRepoPath } from './local-images.ts'
import type { MetadataStore } from './metadata-store.ts'
import { isRawSubcategory } from './taxonomy.ts'

export interface SyncReport {
    /** Files found at another place than recorded: record updated (moved or renamed by hand). */
    moved: { from: string; to: string }[]
    /** Recorded files that exist nowhere any more: recorded as rejected by the user. */
    deleted: string[]
    /** Files whose new folder is not a known class/sub-category: left untouched, record unchanged. */
    unknownFolder: string[]
}

/**
 * Brings sources.json back in line with data/raw after files were moved, renamed or deleted by hand.
 * Files are matched by content (SHA-256), so renames are recognised. The folder a file now lives in is the
 * person's decision and becomes its class/sub-category; nothing on disk is changed.
 */
export async function syncWithDisk(store: MetadataStore, rawDir: string, repoRoot: string): Promise<SyncReport> {
    const report: SyncReport = { moved: [], deleted: [], unknownFolder: [] }
    const onDisk = new Map<string, string>()
    for (const file of await listImageFiles(rawDir)) onDisk.set(toRepoPath(file, repoRoot), file)

    const lost = store.allImages().filter((image) => !onDisk.has(image.path))
    if (lost.length === 0) return report

    const known = new Set(store.allImages().map((image) => image.path))
    const byHash = new Map<string, string>()
    for (const [repoPath, file] of onDisk) {
        if (!known.has(repoPath)) byHash.set(sha256(await readFile(file)), repoPath)
    }

    for (const image of lost) {
        const found = byHash.get(image.sha256)
        if (!found) {
            store.rejectImage(image.path, 'manual-review', 'deleted by hand from data/raw')
            report.deleted.push(image.path)
            continue
        }
        const [, , label, subcategory] = found.split('/')
        if (!label || !subcategory || !isClassLabel(label) || !isRawSubcategory(label, subcategory)) {
            report.unknownFolder.push(found)
            continue
        }
        const from = image.path
        store.updateImage(from, { label, subcategory, filename: path.basename(found), path: found })
        report.moved.push({ from, to: found })
    }
    return report
}
