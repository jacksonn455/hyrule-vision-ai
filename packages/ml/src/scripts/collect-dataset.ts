/**
 * Collects the raw image dataset into data/raw/<label>/<subcategory>/ and records every image's origin and
 * license in data/metadata/sources.json. Resumable: run it again and it continues where it stopped.
 *
 *   node src/scripts/collect-dataset.ts [--target 300] [--sources commons,wikipedia,botw,deepghs] [--dry-run] [--overwrite] [--refresh-catalog]
 *
 * Set HYRULE_COLLECTOR_CONTACT (an e-mail or URL) to identify yourself to Wikimedia: identified clients get a
 * much higher rate limit (200 vs 10 requests per minute), so collection runs ~6× faster.
 */
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { COLLECTION_LABELS } from '@hyrule/shared'
import type { CollectionLabel } from '@hyrule/shared'

import { DatasetCollector } from '../collection/collector.ts'
import { diversify } from '../collection/diversify.ts'
import { DuplicateIndex } from '../collection/duplicate-index.ts'
import { createThrottle, downloadWithRetry } from '../collection/http-client.ts'
import type { DownloadOptions } from '../collection/http-client.ts'
import { DEFAULT_IMAGE_LIMITS } from '../collection/image-validator.ts'
import { indexLocalImages } from '../collection/local-images.ts'
import { acquireMetadataLock } from '../collection/metadata-lock.ts'
import { MetadataStore } from '../collection/metadata-store.ts'
import { BOTW_DATASET, BOTW_SOURCE_NAME, planBotwCandidates } from '../collection/sources/botw-screenshots-plan.ts'
import { loadCommonsCatalog } from '../collection/sources/commons-catalog.ts'
import { COMMONS_CATALOG_ROOTS, planCommonsFile } from '../collection/sources/commons-plan.ts'
import { HuggingFaceRowsClient } from '../collection/sources/huggingface-rows.ts'
import { DEEPGHS_SOURCE_NAME, planDeepghsCandidates } from '../collection/sources/deepghs-character-index.ts'
import { planWikipediaArtwork, WIKIPEDIA_API_URL, WIKIPEDIA_ARTWORK } from '../collection/sources/wikipedia-artwork.ts'
import {
    COMMONS_API_URL,
    COMMONS_SOURCE_NAME,
    WikimediaCommonsClient,
} from '../collection/sources/wikimedia-commons.ts'
import type { ImageCandidate, RejectionReason } from '../collection/types.ts'
import { DATA_DIR, RAW_DATA_DIR, REPO_ROOT } from '../paths.ts'

const METADATA_DIR = path.join(DATA_DIR, 'metadata')

const { values: args } = parseArgs({
    options: {
        target: { type: 'string', default: '300' },
        sources: { type: 'string', default: 'commons,wikipedia,botw,deepghs' },
        'dry-run': { type: 'boolean', default: false },
        overwrite: { type: 'boolean', default: false },
        'refresh-catalog': { type: 'boolean', default: false },
    },
})

const contact = process.env.HYRULE_COLLECTOR_CONTACT
const http: DownloadOptions = {
    retries: 4,
    baseDelayMs: 5_000,
    maxDelayMs: 60_000,
    // Wikimedia can ask for 10 minutes when an unidentified client goes too fast: wait it out, it is their rule.
    maxRetryAfterMs: 15 * 60_000,
    timeoutMs: 60_000,
    maxBytes: DEFAULT_IMAGE_LIMITS.maxBytes,
    userAgent: `HyruleVisionAI-dataset-collector/0.1 (educational, non-commercial${contact ? `; ${contact}` : ''}) node-fetch`,
}
// Wikimedia: 10 req/min for unidentified clients, 200 req/min with contact info. Stay safely below either.
const wikimediaInterval = contact ? 1_000 : 6_500
const throttles = new Map<string, () => Promise<void>>()
function throttleFor(url: string): () => Promise<void> {
    const host = new URL(url).hostname
    const interval = host.endsWith('wikimedia.org') ? wikimediaInterval : 1_000
    if (!throttles.has(host)) throttles.set(host, createThrottle(interval))
    return throttles.get(host)!
}
async function politeDownload(url: string) {
    // Images saved by hand into data/inbox: read from disk, then validated like any download.
    if (url.startsWith('file:')) return { buffer: await readFile(fileURLToPath(url)), contentType: '' }
    await throttleFor(url)()
    return downloadWithRetry(url, http)
}

const sources = new Set(args.sources.split(','))
await mkdir(METADATA_DIR, { recursive: true })
const releaseLock = await acquireMetadataLock(METADATA_DIR)
const store = await MetadataStore.load(METADATA_DIR)
const candidates: ImageCandidate[] = []
const now = new Date().toISOString()

function recordPlanRejections(
    sourceName: string,
    rejected: { url: string; title: string; reason: RejectionReason; detail: string }[],
) {
    for (const rejection of rejected) {
        if (!store.hasImage(rejection.url)) {
            store.addRejection({ ...rejection, sourceName, label: null, subcategory: '', rejectedAt: now })
        }
    }
}

if (sources.has('commons')) {
    const client = new WikimediaCommonsClient(http, throttleFor(COMMONS_API_URL))
    const files = await loadCommonsCatalog(
        client,
        COMMONS_CATALOG_ROOTS,
        path.join(METADATA_DIR, 'commons-catalog.json'),
        {
            refresh: args['refresh-catalog'],
            log: console.log,
        },
    )
    const rejected = []
    for (const file of files) {
        const decision = planCommonsFile(file)
        if ('candidate' in decision) candidates.push(decision.candidate)
        else
            rejected.push({
                url: file.originalUrl,
                title: file.title,
                reason: decision.rejected,
                detail: decision.detail,
            })
    }
    recordPlanRejections(COMMONS_SOURCE_NAME, rejected)
}

if (sources.has('wikipedia')) {
    const client = new WikimediaCommonsClient(http, throttleFor(WIKIPEDIA_API_URL), undefined, WIKIPEDIA_API_URL)
    candidates.push(...planWikipediaArtwork(await client.getFiles(WIKIPEDIA_ARTWORK.map((a) => a.title))))
}

if (sources.has('botw')) {
    const client = new HuggingFaceRowsClient(http, throttleFor('https://datasets-server.huggingface.co'))
    const plan = planBotwCandidates(await client.listImageRows(BOTW_DATASET))
    candidates.push(...plan.candidates)
    recordPlanRejections(BOTW_SOURCE_NAME, plan.rejected)
}

if (sources.has('deepghs')) {
    const plan = await planDeepghsCandidates(path.join(DATA_DIR, 'cache', 'deepghs'), async (url) => {
        console.log(`downloading ${url}`)
        await throttleFor(url)()
        return (await downloadWithRetry(url, { ...http, maxBytes: 50 * 1024 * 1024 })).buffer
    })
    candidates.push(...plan.candidates)
    recordPlanRejections(DEEPGHS_SOURCE_NAME, plan.rejected)
}

for (const candidate of candidates) store.forgetPlanRejection(candidate.url)

// Mix sources, photographers and games so that the first N images of each class are as varied as possible.
const ordered = diversify(candidates, [
    (c) => c.label,
    (c) => c.sourceName,
    (c) => c.subcategory,
    (c) => c.author ?? '',
])

const target = Number(args.target)
const targets = Object.fromEntries(COLLECTION_LABELS.map((label) => [label, target])) as Record<CollectionLabel, number>
for (const label of COLLECTION_LABELS) {
    const planned = ordered.filter((c) => c.label === label)
    const counts = new Map<string, number>()
    for (const c of planned)
        counts.set(`${c.sourceName} → ${c.subcategory}`, (counts.get(`${c.sourceName} → ${c.subcategory}`) ?? 0) + 1)
    const bySub = [...counts].map(([key, count]) => `${key}: ${count}`).join(', ')
    console.log(`${label}: ${planned.length} candidates (${bySub}); already collected: ${store.countByLabel(label)}`)
}

await store.save()
if (args['dry-run']) {
    await releaseLock()
    process.exit(0)
}

const index = new DuplicateIndex()
const local = await indexLocalImages(RAW_DATA_DIR, index, REPO_ROOT)
console.log(`indexed ${local.indexed} images already in data/raw (unreadable: ${local.unreadable.length})`)

const collector = new DatasetCollector({
    download: politeDownload,
    store,
    index,
    rawDir: RAW_DATA_DIR,
    repoRoot: REPO_ROOT,
    limits: DEFAULT_IMAGE_LIMITS,
    log: console.log,
})
const summary = await collector.collect(ordered, { targets, overwrite: args.overwrite })

console.log('\nsummary:', summary)
for (const label of COLLECTION_LABELS) console.log(`${label}: ${store.countByLabel(label)} images`)
await releaseLock()
