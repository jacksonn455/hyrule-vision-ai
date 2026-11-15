/**
 * Writes docs/research/DATASET-COLLECTION-REPORT.md from data/metadata/*.json.
 *
 *   node src/scripts/dataset-report.ts
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { listImageFiles, toRepoPath } from '../collection/local-images.ts'
import { MetadataStore } from '../collection/metadata-store.ts'
import { buildCollectionReport } from '../collection/report.ts'
import { SOURCE_FINDINGS } from '../collection/sources/source-research.ts'
import { DATA_DIR, RAW_DATA_DIR, REPO_ROOT } from '../paths.ts'

const REPORT_FILE = path.join(REPO_ROOT, 'docs', 'research', 'DATASET-COLLECTION-REPORT.md')

const store = await MetadataStore.load(path.join(DATA_DIR, 'metadata'))
const known = new Set(store.allImages().map((image) => image.path))
const unaudited = (await listImageFiles(RAW_DATA_DIR))
    .map((file) => toRepoPath(file, REPO_ROOT))
    .filter((p) => !known.has(p))

// Written after looking at the contact sheets (ml:review-dataset sheets): one finding per line.
const observations = JSON.parse(
    await readFile(path.join(DATA_DIR, 'metadata', 'review-notes.json'), 'utf8').catch(() => '[]'),
) as string[]

const report = buildCollectionReport({
    images: store.allImages(),
    rejections: store.allRejections(),
    sources: SOURCE_FINDINGS,
    unaudited,
    observations,
    generatedAt: new Date(),
})
await mkdir(path.dirname(REPORT_FILE), { recursive: true })
await writeFile(REPORT_FILE, report, 'utf8')
console.log(`wrote ${toRepoPath(REPORT_FILE, REPO_ROOT)}`)
