/**
 * Imports images you collected by hand (from any website, your own screenshots, sprite sheets you downloaded in
 * your browser) into data/raw, with the same validation, duplicate detection and metadata as the collector.
 *
 * A) Drag files into folders, then import everything at once:
 *      data/inbox/<label>/<subcategory>/                 e.g. data/inbox/zelda/twilight-princess/
 *      data/inbox/sprite-sheets/<label>/<subcategory>/   sheets are cut into one image per sprite
 *    node src/scripts/import-images.ts
 *
 * B) Import files from anywhere (drag them from Explorer into the terminal to paste their paths):
 *    node src/scripts/import-images.ts --label zelda --subcategory twilight-princess [--sprites] <file|folder>...
 *
 * Inbox files that were imported (or were duplicates) are deleted from the inbox; rejected ones are moved to
 * data/inbox/_rejected/<reason>/ for you to look at. Files given by path are only read, never moved.
 * Add --dry-run to see what would happen.
 */
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { CLASS_LABELS, isClassLabel } from '@hyrule/shared'
import type { ClassLabel } from '@hyrule/shared'

import { DatasetCollector } from '../collection/collector.ts'
import type { Outcome } from '../collection/collector.ts'
import { DuplicateIndex } from '../collection/duplicate-index.ts'
import { sha256 } from '../collection/hashing.ts'
import { DEFAULT_IMAGE_LIMITS, hasAllowedExtension } from '../collection/image-validator.ts'
import { indexLocalImages, toRepoPath } from '../collection/local-images.ts'
import type { InboxFile, ManualFile } from '../collection/manual-import.ts'
import {
    listInbox,
    manualCandidate,
    readEmbeddedCredits,
    readZoneIdentifiers,
    toLocalPath,
} from '../collection/manual-import.ts'
import { acquireMetadataLock } from '../collection/metadata-lock.ts'
import { MetadataStore } from '../collection/metadata-store.ts'
import { cutSprite, findSprites } from '../collection/sprite-sheet.ts'
import { isRawSubcategory, RAW_SUBCATEGORIES } from '../collection/taxonomy.ts'
import type { ImageCandidate } from '../collection/types.ts'
import { DATA_DIR, RAW_DATA_DIR, REPO_ROOT } from '../paths.ts'

const INBOX_DIR = path.join(DATA_DIR, 'inbox')
const METADATA_DIR = path.join(DATA_DIR, 'metadata')
/** Original sprite sheets are kept here, outside data/raw: a whole sheet is not a training image. */
const SHEETS_DIR = path.join(DATA_DIR, 'sources', 'sprite-sheets')
const FRAMES_DIR = path.join(DATA_DIR, 'cache', 'sprite-frames')

const { values: args, positionals } = parseArgs({
    allowPositionals: true,
    options: {
        label: { type: 'string' },
        subcategory: { type: 'string' },
        sprites: { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
    },
})

function fail(message: string): never {
    console.error(message)
    process.exit(1)
}

async function expand(inputs: readonly string[]): Promise<string[]> {
    const files: string[] = []
    for (const input of inputs.map(toLocalPath)) {
        const info = await stat(input).catch(() => fail(`not found: ${input}`))
        if (info.isDirectory()) {
            const entries = await readdir(input, { recursive: true, withFileTypes: true })
            for (const e of entries) if (e.isFile()) files.push(path.join(e.parentPath, e.name))
        } else files.push(input)
    }
    return files
}

// 1. What to import.
let inputs: InboxFile[]
let fromInbox = true
if (positionals.length > 0) {
    fromInbox = false
    const label = args.label ?? fail('--label is required when importing files by path (link, zelda or other)')
    if (!isClassLabel(label)) fail(`--label must be one of: ${CLASS_LABELS.join(', ')}`)
    const subcategory =
        args.subcategory ?? (label === 'other' ? fail('--subcategory is required for "other"') : 'unspecified')
    if (!isRawSubcategory(label, subcategory)) {
        fail(`--subcategory for ${label} must be one of: ${RAW_SUBCATEGORIES[label].join(', ')}`)
    }
    const files = await expand(positionals)
    for (const file of files.filter((f) => !hasAllowedExtension(f)))
        console.warn(`skipped (not JPEG/PNG/WebP): ${file}`)
    inputs = files
        .filter(hasAllowedExtension)
        .map((file) => ({ file, label, subcategory, isSpriteSheet: args.sprites }))
} else {
    const inbox = await listInbox(INBOX_DIR)
    for (const file of inbox.misplaced) {
        console.warn(`not imported (put it in data/inbox/<label>/<subcategory>/): ${toRepoPath(file, REPO_ROOT)}`)
    }
    inputs = inbox.files
}
if (inputs.length === 0) fail('nothing to import (see the usage at the top of import-images.ts)')

await mkdir(METADATA_DIR, { recursive: true })
const releaseLock = args['dry-run'] ? async () => {} : await acquireMetadataLock(METADATA_DIR)
const store = await MetadataStore.load(METADATA_DIR)

// 2. Facts about where each file came from (never guessed).
const zone = await readZoneIdentifiers(inputs.map((i) => i.file))

// 3. Candidates: one per image, one per sprite for sheets.
const candidates: ImageCandidate[] = []
const inputOf = new Map<string, InboxFile>()
let framesExtracted = 0
for (const input of inputs) {
    const buffer = await readFile(input.file)
    const base: Omit<ManualFile, 'file' | 'originalFilename' | 'sha256'> = {
        label: input.label,
        subcategory: input.subcategory,
        hints: { ...zone.get(input.file), ...(await readEmbeddedCredits(buffer)) },
    }
    if (!input.isSpriteSheet) {
        const candidate = manualCandidate({
            ...base,
            file: input.file,
            originalFilename: path.basename(input.file),
            sha256: sha256(buffer),
        })
        candidates.push(candidate)
        inputOf.set(candidate.url, input)
        continue
    }

    const sheetHash = sha256(buffer)
    const sheetName = path.parse(input.file).name
    const keptSheet = path.join(
        SHEETS_DIR,
        input.label,
        input.subcategory,
        `${sheetName}-${sheetHash.slice(0, 8)}${path.extname(input.file)}`,
    )
    const boxes = await findSprites(buffer)
    console.log(`${path.basename(input.file)}: ${boxes.length} sprites found`)
    framesExtracted += boxes.length
    if (args['dry-run']) continue
    await mkdir(path.dirname(keptSheet), { recursive: true })
    await writeFile(keptSheet, buffer, { flag: 'w' })
    const framesDir = path.join(FRAMES_DIR, sheetHash.slice(0, 16))
    await mkdir(framesDir, { recursive: true })
    for (const [n, box] of boxes.entries()) {
        const frame = await cutSprite(buffer, box, DEFAULT_IMAGE_LIMITS.minSide)
        const frameFile = path.join(framesDir, `${sheetName}-frame-${String(n + 1).padStart(3, '0')}.png`)
        await writeFile(frameFile, frame)
        const candidate = manualCandidate({
            ...base,
            file: frameFile,
            originalFilename: path.basename(frameFile),
            sha256: sha256(frame),
            derivedFrom: { path: toRepoPath(keptSheet, REPO_ROOT), sha256: sheetHash },
        })
        candidates.push(candidate)
        inputOf.set(candidate.url, input)
    }
}

if (args['dry-run']) {
    console.log(`\ndry run: ${candidates.length} images and ${framesExtracted} sprite frames would be imported`)
    process.exit(0)
}

// 4. Same pipeline as the collector: validate, dedupe (against everything in data/raw), file, record.
const index = new DuplicateIndex()
await indexLocalImages(RAW_DATA_DIR, index, REPO_ROOT)
const collector = new DatasetCollector({
    download: async (url) => ({ buffer: await readFile(fileURLToPath(url)), contentType: '' }),
    store,
    index,
    rawDir: RAW_DATA_DIR,
    repoRoot: REPO_ROOT,
    limits: DEFAULT_IMAGE_LIMITS,
})
const results: { candidate: ImageCandidate; outcome: Outcome }[] = []
const unlimited = Object.fromEntries(CLASS_LABELS.map((l) => [l, Infinity])) as Record<ClassLabel, number>
await collector.collect(candidates, {
    targets: unlimited,
    onOutcome: (candidate, outcome) => results.push({ candidate, outcome }),
})
await store.save()

// 5. Tidy the inbox: done files leave it, refused ones go to _rejected/<reason>/ (a sheet goes by its worst frame).
if (fromInbox) {
    const outcomesByFile = new Map<string, Outcome[]>()
    for (const { candidate, outcome } of results) {
        const file = inputOf.get(candidate.url)!.file
        outcomesByFile.set(file, [...(outcomesByFile.get(file) ?? []), outcome])
    }
    for (const input of inputs) {
        const outcomes = outcomesByFile.get(input.file) ?? []
        const done =
            input.isSpriteSheet ||
            outcomes.every((o) => ['kept', 'skipped', 'duplicate-exact', 'duplicate-near'].includes(o))
        if (done) await rm(input.file)
        else {
            const reason = outcomes.find((o) => o !== 'kept') ?? 'unknown'
            const target = path.join(INBOX_DIR, '_rejected', reason, path.basename(input.file))
            await mkdir(path.dirname(target), { recursive: true })
            await rename(input.file, target)
        }
    }
}
await releaseLock()

// 6. Summary.
const count = (pred: (o: Outcome) => boolean) => results.filter((r) => pred(r.outcome)).length
const rejectedReasons = new Map<string, number>()
for (const { outcome } of results) {
    if (!['kept', 'skipped', 'duplicate-exact', 'duplicate-near'].includes(outcome)) {
        rejectedReasons.set(outcome, (rejectedReasons.get(outcome) ?? 0) + 1)
    }
}
const summary = {
    importedAt: new Date().toISOString(),
    files: inputs.length,
    spriteFramesExtracted: framesExtracted,
    imported: count((o) => o === 'kept'),
    alreadyImported: count((o) => o === 'skipped'),
    duplicates: count((o) => o === 'duplicate-exact' || o === 'duplicate-near'),
    rejected: Object.fromEntries(rejectedReasons),
    details: results.map(({ candidate, outcome }) => ({
        file: candidate.originalFilename,
        outcome,
        savedAs: store.allImages().find((i) => i.url === candidate.url)?.path,
        detail: store.allRejections().find((r) => r.url === candidate.url)?.detail,
    })),
}
const summaryFile = path.join(METADATA_DIR, 'imports', `${summary.importedAt.replace(/[:.]/g, '-')}.json`)
await mkdir(path.dirname(summaryFile), { recursive: true })
await writeFile(summaryFile, `${JSON.stringify(summary, null, 2)}\n`)

for (const d of summary.details)
    console.log(`${d.outcome.padEnd(16)} ${d.file}${d.savedAs ? ` → ${d.savedAs}` : d.detail ? ` (${d.detail})` : ''}`)
console.log(`
Files:            ${summary.files}${framesExtracted ? ` (${framesExtracted} sprite frames extracted)` : ''}
Imported:         ${summary.imported}
Already imported: ${summary.alreadyImported}
Duplicates:       ${summary.duplicates}
Rejected:         ${[...rejectedReasons].map(([r, n]) => `${n} ${r}`).join(', ') || 0}
Summary saved to ${toRepoPath(summaryFile, REPO_ROOT)}`)
