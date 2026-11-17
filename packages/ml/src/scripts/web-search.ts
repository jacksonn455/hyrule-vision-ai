/**
 * Bulk-downloads image-search results (Bing Images, SafeSearch strict) into data/inbox/<label>/<subcategory>/,
 * ready for `npm run ml:import-images` (validation, duplicate detection, metadata). PRIVATE STUDY ONLY: the
 * licence of these images is unknown, so they are git-ignored like the rest of data/ and must not be published.
 *
 * Google Images is not used: it answers scripted requests with a bot-check redirect (only its paid API works).
 *
 * On Windows each file gets a "Zone.Identifier" stream with the image URL and the page it came from, exactly like
 * a browser download, so import-images records the origin in sources.json.
 *
 *   node src/scripts/web-search.ts [--per-query 100] [--only midna,link/twilight-princess] [--suffix "game screenshot"] [--dry-run]
 *
 * In-game screenshots are the most useful images (consistent art style per game): run extra passes with
 * --suffix "game screenshot" / "gameplay cutscene". Files are named by content hash, so repeats are skipped.
 */
import { createHash } from 'node:crypto'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { DATA_DIR } from '../paths.ts'

const INBOX_DIR = path.join(DATA_DIR, 'inbox')

const GAMES: Record<string, string> = {
    nes: 'NES 8-bit',
    'a-link-to-the-past': 'A Link to the Past',
    'ocarina-of-time': 'Ocarina of Time',
    'majoras-mask': "Majora's Mask",
    'wind-waker': 'Wind Waker',
    'twilight-princess': 'Twilight Princess',
    'skyward-sword': 'Skyward Sword',
    'breath-of-the-wild': 'Breath of the Wild',
    'tears-of-the-kingdom': 'Tears of the Kingdom',
}

const CHARACTERS: Record<string, string> = {
    'skull-kid': "Skull Kid Majora's Mask",
    mipha: 'Mipha Zelda Breath of the Wild',
    midna: 'Midna Twilight Princess',
    ganondorf: 'Ganondorf Zelda',
    malon: 'Malon Zelda Ocarina of Time',
    paya: 'Paya Zelda Breath of the Wild',
    saria: 'Saria Zelda Ocarina of Time',
    impa: 'Impa Zelda',
    purah: 'Purah Zelda',
    riju: 'Riju Zelda Breath of the Wild',
    fi: 'Fi Skyward Sword',
    tingle: 'Tingle Zelda',
    zant: 'Zant Twilight Princess',
    ghirahim: 'Ghirahim Skyward Sword',
    urbosa: 'Urbosa Zelda Breath of the Wild',
    sidon: 'Prince Sidon Zelda',
    revali: 'Revali Zelda Breath of the Wild',
    daruk: 'Daruk Zelda Breath of the Wild',
}

/** inbox folder (label/subcategory) → search query. */
const QUERIES: Record<string, string> = {
    ...Object.fromEntries(Object.entries(GAMES).map(([slug, title]) => [`link/${slug}`, `Link ${title}`])),
    ...Object.fromEntries(Object.entries(GAMES).map(([slug, title]) => [`zelda/${slug}`, `Princess Zelda ${title}`])),
    ...Object.fromEntries(Object.entries(CHARACTERS).map(([slug, query]) => [`other/${slug}`, query])),
}

const { values: args } = parseArgs({
    options: {
        'per-query': { type: 'string', default: '100' },
        only: { type: 'string' },
        /** Appended to every query, e.g. "game screenshot" to favour in-game images over fan art. */
        suffix: { type: 'string', default: '' },
        'dry-run': { type: 'boolean', default: false },
    },
})
const perQuery = Number(args['per-query'])
const only = args.only?.split(',').map((s) => (s.includes('/') ? s : `other/${s}`))
const jobs = Object.entries(QUERIES)
    .filter(([folder]) => !only || only.includes(folder))
    .map(([folder, query]) => [folder, `${query} ${args.suffix}`.trim()] as const)

const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const MAX_BYTES = 10 * 1024 * 1024
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface Result {
    imageUrl: string
    pageUrl: string | undefined
}

/** Bing's results page embeds one JSON blob per image ("m" attribute) with murl = image, purl = page. */
async function search(query: string, wanted: number): Promise<Result[]> {
    const results = new Map<string, Result>()
    for (let first = 0; results.size < wanted && first < wanted * 3; first += 35) {
        const url = `https://www.bing.com/images/async?q=${encodeURIComponent(query)}&first=${first}&count=35&adlt=strict&mmasync=1`
        const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US' } })
        if (!response.ok) throw new Error(`Bing answered ${response.status}`)
        const html = await response.text()
        const before = results.size
        for (const match of html.matchAll(/\sm="([^"]+)"/g)) {
            try {
                const data = JSON.parse(match[1]!.replaceAll('&quot;', '"').replaceAll('&amp;', '&')) as {
                    murl?: string
                    purl?: string
                }
                if (data.murl?.startsWith('http')) results.set(data.murl, { imageUrl: data.murl, pageUrl: data.purl })
            } catch {
                // Not an image result.
            }
        }
        if (results.size === before) break // no more results
        await sleep(1000) // be polite with Bing
    }
    return [...results.values()].slice(0, wanted)
}

function extensionOf(buffer: Buffer): '.jpg' | '.png' | '.webp' | null {
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return '.jpg'
    if (buffer.subarray(0, 4).toString('hex') === '89504e47') return '.png'
    if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return '.webp'
    return null
}

async function download(result: Result): Promise<Buffer | null> {
    try {
        const response = await fetch(result.imageUrl, {
            headers: { 'User-Agent': USER_AGENT, ...(result.pageUrl ? { Referer: result.pageUrl } : {}) },
            signal: AbortSignal.timeout(20_000),
        })
        if (!response.ok) return null
        const buffer = Buffer.from(await response.arrayBuffer())
        return buffer.length > 0 && buffer.length <= MAX_BYTES ? buffer : null
    } catch {
        return null
    }
}

/** Runs `worker` on every item with at most `limit` in flight. */
async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
    let next = 0
    await Promise.all(
        Array.from({ length: limit }, async () => {
            while (next < items.length) await worker(items[next++]!)
        }),
    )
}

let total = 0
for (const [folder, query] of jobs) {
    const dir = path.join(INBOX_DIR, ...folder.split('/'))
    const results = await search(query, perQuery)
    if (args['dry-run']) {
        console.log(`${folder}: "${query}" → ${results.length} results`)
        continue
    }
    await mkdir(dir, { recursive: true })
    const existing = new Set(await readdir(dir))
    let saved = 0
    await pool(results, 6, async (result) => {
        const buffer = await download(result)
        const extension = buffer && extensionOf(buffer)
        if (!buffer || !extension) return
        const name = `web-${createHash('sha256').update(buffer).digest('hex').slice(0, 16)}${extension}`
        if (existing.has(name)) return
        existing.add(name)
        const file = path.join(dir, name)
        await writeFile(file, buffer)
        if (process.platform === 'win32') {
            const zone = `[ZoneTransfer]\r\nZoneId=3\r\n${result.pageUrl ? `ReferrerUrl=${result.pageUrl}\r\n` : ''}HostUrl=${result.imageUrl}\r\n`
            await writeFile(`${file}:Zone.Identifier`, zone).catch(() => {})
        }
        saved++
    })
    total += saved
    console.log(`${folder}: "${query}" → ${saved}/${results.length} saved`)
}
if (!args['dry-run']) console.log(`\n${total} images in data/inbox. Next: npm run ml:import-images`)
