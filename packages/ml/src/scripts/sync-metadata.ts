/**
 * Run after moving, renaming or deleting images in data/raw by hand: updates data/metadata/sources.json to match.
 * Moved files take the class/sub-category of their new folder; deleted ones are recorded as rejected by you.
 *
 *   node src/scripts/sync-metadata.ts
 */
import path from 'node:path'

import { syncWithDisk } from '../collection/disk-sync.ts'
import { acquireMetadataLock } from '../collection/metadata-lock.ts'
import { MetadataStore } from '../collection/metadata-store.ts'
import { DATA_DIR, RAW_DATA_DIR, REPO_ROOT } from '../paths.ts'

const METADATA_DIR = path.join(DATA_DIR, 'metadata')
const releaseLock = await acquireMetadataLock(METADATA_DIR)
const store = await MetadataStore.load(METADATA_DIR)
const report = await syncWithDisk(store, RAW_DATA_DIR, REPO_ROOT)
await store.save()
await releaseLock()

for (const { from, to } of report.moved) console.log(`moved    ${from} → ${to}`)
for (const file of report.deleted) console.log(`deleted  ${file}`)
for (const file of report.unknownFolder) console.warn(`unknown folder (not a sub-category, record unchanged): ${file}`)
console.log(
    `\n${report.moved.length} moved, ${report.deleted.length} deleted, ${report.unknownFolder.length} in unknown folders`,
)
