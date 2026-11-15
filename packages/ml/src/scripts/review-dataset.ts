/**
 * Visual review helpers.
 *
 *   node src/scripts/review-dataset.ts sheets [--out dir]
 *       Writes contact sheets (numbered thumbnails per label/sub-category) to look through quickly.
 *   node src/scripts/review-dataset.ts reject --reason "two characters" data/raw/link/.../a.jpg ...
 *       Deletes the files and records them as rejected, so the collector never downloads them again.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

import sharp from 'sharp'

import { MetadataStore } from '../collection/metadata-store.ts'
import type { ImageRecord } from '../collection/types.ts'
import { DATA_DIR, REPO_ROOT } from '../paths.ts'

const THUMB = 160
const COLUMNS = 8
const PER_SHEET = 48

const { values: args, positionals } = parseArgs({
    allowPositionals: true,
    options: { reason: { type: 'string' }, out: { type: 'string', default: path.join(DATA_DIR, 'review') } },
})
const [command, ...files] = positionals
const store = await MetadataStore.load(path.join(DATA_DIR, 'metadata'))

async function contactSheet(images: readonly ImageRecord[], file: string): Promise<void> {
    const tiles = await Promise.all(
        images.map(async (image, i) => {
            const thumb = await sharp(path.join(REPO_ROOT, image.path))
                .resize(THUMB, THUMB, { fit: 'contain', background: '#202020' })
                .toBuffer()
            const label = Buffer.from(
                `<svg width="${THUMB}" height="22"><rect width="100%" height="100%" fill="#000"/>` +
                    `<text x="4" y="16" font-size="15" fill="#ff0" font-family="sans-serif">${i}</text></svg>`,
            )
            return {
                input: await sharp(thumb)
                    .composite([{ input: label, top: 0, left: 0 }])
                    .toBuffer(),
                left: (i % COLUMNS) * THUMB,
                top: Math.floor(i / COLUMNS) * THUMB,
            }
        }),
    )
    const rows = Math.ceil(images.length / COLUMNS)
    await sharp({ create: { width: COLUMNS * THUMB, height: rows * THUMB, channels: 3, background: '#000' } })
        .composite(tiles)
        .jpeg({ quality: 80 })
        .toFile(file)
}

if (command === 'sheets') {
    await rm(args.out, { recursive: true, force: true })
    await mkdir(args.out, { recursive: true })
    const groups = new Map<string, ImageRecord[]>()
    for (const image of store.allImages()) {
        const key = `${image.label}-${image.subcategory}`
        groups.set(key, [...(groups.get(key) ?? []), image])
    }
    const index: Record<string, string[]> = {}
    for (const [key, images] of groups) {
        for (let start = 0; start < images.length; start += PER_SHEET) {
            const name = `${key}-${start / PER_SHEET + 1}.jpg`
            const chunk = images.slice(start, start + PER_SHEET)
            await contactSheet(chunk, path.join(args.out, name))
            index[name] = chunk.map((image) => image.path)
        }
    }
    await writeFile(path.join(args.out, 'index.json'), JSON.stringify(index, null, 2))
    console.log(`wrote ${Object.keys(index).length} contact sheets to ${args.out}`)
} else if (command === 'reject' && args.reason && files.length > 0) {
    for (const file of files) {
        const image = store.rejectImage(file, 'manual-review', args.reason)
        if (!image) {
            console.warn(`not in sources.json: ${file}`)
            continue
        }
        await rm(path.join(REPO_ROOT, image.path), { force: true })
        console.log(`rejected ${file}`)
    }
    await store.save()
} else {
    console.error('usage: review-dataset.ts sheets [--out dir] | reject --reason "<why>" <path>...')
    process.exitCode = 1
}
