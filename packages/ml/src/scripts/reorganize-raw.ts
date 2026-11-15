/**
 * Moves already collected images to the sub-folder the CURRENT planning rules give them (e.g. after adding
 * per-character folders, or fixing a game-detection rule). The folder is recomputed from the source's own data,
 * never guessed; the class (link / zelda / other) is never changed.
 *
 *   node src/scripts/reorganize-raw.ts [--dry-run] [--only-from other-characters]
 *
 * --only-from limits the moves to images currently in that sub-folder, so folders you organised by hand stay as they are.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

import type { ClassLabel } from '@hyrule/shared'

import { createThrottle } from '../collection/http-client.ts'
import { acquireMetadataLock } from '../collection/metadata-lock.ts'
import { MetadataStore } from '../collection/metadata-store.ts'
import { relocateImage } from '../collection/relocate.ts'
import { BOTW_DATASET, planBotwCandidates } from '../collection/sources/botw-screenshots-plan.ts'
import { planCommonsFile } from '../collection/sources/commons-plan.ts'
import { DEEPGHS_CHARACTERS } from '../collection/sources/deepghs-character-index.ts'
import { HuggingFaceRowsClient } from '../collection/sources/huggingface-rows.ts'
import type { CommonsFile } from '../collection/sources/wikimedia-commons.ts'
import { WIKIPEDIA_ARTWORK, WIKIPEDIA_SOURCE_NAME } from '../collection/sources/wikipedia-artwork.ts'
import type { RawSubcategory } from '../collection/taxonomy.ts'
import { DATA_DIR, RAW_DATA_DIR, REPO_ROOT } from '../paths.ts'

const METADATA_DIR = path.join(DATA_DIR, 'metadata')
const { values: args } = parseArgs({
    options: { 'dry-run': { type: 'boolean', default: false }, 'only-from': { type: 'string' } },
})

/** url → where the current rules put it. */
const expected = new Map<string, { label: ClassLabel; subcategory: RawSubcategory }>()

const catalog = JSON.parse(await readFile(path.join(METADATA_DIR, 'commons-catalog.json'), 'utf8')) as {
    files: CommonsFile[]
}
for (const file of catalog.files) {
    const decision = planCommonsFile(file)
    if ('candidate' in decision) expected.set(decision.candidate.url, decision.candidate)
}

const botwRows = await new HuggingFaceRowsClient(
    {
        retries: 4,
        baseDelayMs: 5_000,
        maxDelayMs: 60_000,
        maxRetryAfterMs: 15 * 60_000,
        timeoutMs: 60_000,
        maxBytes: 20 * 1024 * 1024,
        userAgent: 'HyruleVisionAI-dataset-collector/0.1 (educational, non-commercial) node-fetch',
    },
    createThrottle(1_000),
).listImageRows(BOTW_DATASET)
for (const candidate of planBotwCandidates(botwRows).candidates) expected.set(candidate.url, candidate)

const releaseLock = args['dry-run'] ? async () => {} : await acquireMetadataLock(METADATA_DIR)
const store = await MetadataStore.load(METADATA_DIR)

const moves: { from: string; to: RawSubcategory }[] = []
for (const image of store.allImages()) {
    let target = expected.get(image.url)
    if (!target && image.sourceName === WIKIPEDIA_SOURCE_NAME)
        target = WIKIPEDIA_ARTWORK.find((a) => a.title === image.title)
    // Fan-art crops: the character comes from the dataset folder in the URL. Link/Zelda game folders came from the
    // post's tags at collection time and are kept as they are.
    const character = DEEPGHS_CHARACTERS.find((c) => image.url.includes(`/blob/main/${c.folder}/images.zip#`))
    if (!target && character?.label === 'other') target = character
    if (args['only-from'] && image.subcategory !== args['only-from']) continue
    if (target && target.label === image.label && target.subcategory !== image.subcategory) {
        moves.push({ from: image.path, to: target.subcategory })
    }
}

const summary = new Map<string, number>()
for (const move of moves) {
    const key = `${move.from.split('/')[3]} → ${move.to}`
    summary.set(key, (summary.get(key) ?? 0) + 1)
    if (!args['dry-run']) await relocateImage(store, move.from, move.to, RAW_DATA_DIR, REPO_ROOT)
}
if (!args['dry-run']) await store.save()
await releaseLock()

for (const [key, count] of [...summary].sort()) console.log(`${String(count).padStart(4)}  ${key}`)
console.log(`${args['dry-run'] ? 'would move' : 'moved'} ${moves.length} images`)
