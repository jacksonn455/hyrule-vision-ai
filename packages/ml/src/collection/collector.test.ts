import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DatasetCollector } from './collector.ts'
import type { CollectorDeps } from './collector.ts'
import { DuplicateIndex } from './duplicate-index.ts'
import { buildImageFilename, slugify } from './filenames.ts'
import { sha256 } from './hashing.ts'
import type { Downloaded } from './http-client.ts'
import { DEFAULT_IMAGE_LIMITS } from './image-validator.ts'
import { indexLocalImages } from './local-images.ts'
import { MetadataStore } from './metadata-store.ts'
import { blockImage, candidate } from './test-fixtures.ts'

const targets = { link: 10, zelda: 10, other: 10 }

describe('DatasetCollector', () => {
    let root: string
    let rawDir: string
    let store: MetadataStore
    let index: DuplicateIndex
    let files: Map<string, Downloaded | Error>

    function collector(overrides: Partial<CollectorDeps> = {}) {
        return new DatasetCollector({
            download: (url) => {
                const file = files.get(url)
                return file instanceof Error || !file ? Promise.reject(file ?? new Error('404')) : Promise.resolve(file)
            },
            store,
            index,
            rawDir,
            repoRoot: root,
            limits: DEFAULT_IMAGE_LIMITS,
            now: () => new Date('2026-10-29T12:00:00.000Z'),
            ...overrides,
        })
    }

    async function serve(url: string, seed: number, format: 'png' | 'jpeg' = 'png') {
        files.set(url, { buffer: await blockImage(seed, { format }), contentType: `image/${format}` })
    }

    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'hyrule-collector-'))
        rawDir = path.join(root, 'data', 'raw')
        store = await MetadataStore.load(path.join(root, 'data', 'metadata'))
        index = new DuplicateIndex()
        files = new Map()
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('files each image under data/raw/<label>/<subcategory>/ with a descriptive name', async () => {
        await serve('https://x/link.png', 1)
        await serve('https://x/zelda.jpg', 2, 'jpeg')
        await serve('https://x/ganondorf.png', 3)

        const summary = await collector().collect(
            [
                candidate({
                    url: 'https://x/link.png',
                    label: 'link',
                    subcategory: 'twilight-princess',
                    title: 'File:Link TP.png',
                }),
                candidate({
                    url: 'https://x/zelda.jpg',
                    label: 'zelda',
                    subcategory: 'breath-of-the-wild',
                    title: 'File:Zelda.jpg',
                }),
                candidate({
                    url: 'https://x/ganondorf.png',
                    label: 'other',
                    subcategory: 'ganondorf',
                    title: 'File:Ganon.png',
                }),
            ],
            { targets },
        )

        expect(summary).toEqual({ kept: 3 })
        expect(await readdir(path.join(rawDir, 'link', 'twilight-princess'))).toEqual([
            expect.stringMatching(/^link-twilight-princess-link-tp-[0-9a-f]{8}\.png$/) as string,
        ])
        expect(await readdir(path.join(rawDir, 'zelda', 'breath-of-the-wild'))).toEqual([
            expect.stringMatching(/^zelda-breath-of-the-wild-zelda-[0-9a-f]{8}\.jpg$/) as string,
        ])
        expect(await readdir(path.join(rawDir, 'other', 'ganondorf'))).toHaveLength(1)
    })

    it('stores the original bytes and records origin, license and hash', async () => {
        await serve('https://x/link.png', 1)

        await collector().collect([candidate({ url: 'https://x/link.png' })], { targets })

        const [image] = store.allImages()
        const saved = await readFile(path.join(root, image!.path))
        expect(sha256(saved)).toBe(image!.sha256)
        expect(image).toMatchObject({
            label: 'link',
            subcategory: 'wind-waker',
            url: 'https://x/link.png',
            license: 'CC BY-SA 4.0',
            attribution: 'Jane Doe, CC BY-SA 4.0',
            format: 'png',
            width: 256,
            height: 256,
            downloadedAt: '2026-10-29T12:00:00.000Z',
        })
        expect(image!.path).toMatch(/^data\/raw\/link\/wind-waker\//)
        // Saved after each image: the metadata on disk is already up to date.
        expect((await MetadataStore.load(path.join(root, 'data', 'metadata'))).allImages()).toHaveLength(1)
    })

    it('rejects invalid content and records why', async () => {
        files.set('https://x/page.png', { buffer: Buffer.from('<html>Not found</html>'), contentType: 'text/html' })
        files.set('https://x/garbage.png', { buffer: Buffer.from('garbage'), contentType: 'image/png' })
        files.set('https://x/icon.png', {
            buffer: await blockImage(1, { width: 64, height: 64 }),
            contentType: 'image/png',
        })
        files.set('https://x/fail.png', new Error('HTTP 503'))

        const summary = await collector().collect(
            ['page', 'garbage', 'icon', 'fail'].map((name) => candidate({ url: `https://x/${name}.png` })),
            { targets },
        )

        expect(summary).toEqual({ 'not-an-image': 2, 'too-small': 1, 'download-failed': 1 })
        expect(store.allImages()).toEqual([])
        expect(store.allRejections().map((r) => r.reason)).toEqual([
            'not-an-image',
            'not-an-image',
            'too-small',
            'download-failed',
        ])
        await expect(readdir(rawDir)).rejects.toThrow()
    })

    it('skips exact and near duplicates, including images already on disk without metadata', async () => {
        const handAdded = path.join(rawDir, 'link', 'link-01.png')
        await mkdir(path.dirname(handAdded), { recursive: true })
        await writeFile(handAdded, await blockImage(7))
        await indexLocalImages(rawDir, index, root)

        await serve('https://x/a.png', 1)
        await serve('https://x/a-again.png', 1)
        await serve('https://x/hand-added-copy.jpg', 7, 'jpeg')

        const summary = await collector().collect(
            [
                candidate({ url: 'https://x/a.png' }),
                candidate({ url: 'https://x/a-again.png' }),
                candidate({ url: 'https://x/hand-added-copy.jpg' }),
            ],
            { targets },
        )

        expect(summary).toEqual({ kept: 1, 'duplicate-exact': 1, 'duplicate-near': 1 })
        expect(store.allRejections()[1]!.detail).toContain('data/raw/link/link-01.png')
    })

    it('never overwrites an existing file unless asked to', async () => {
        await serve('https://x/link.png', 1)
        const buffer = (files.get('https://x/link.png') as Downloaded).buffer
        const filename = buildImageFilename(candidate(), sha256(buffer), 'png')
        const target = path.join(rawDir, 'link', 'wind-waker', filename)
        await mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, 'someone else’s file')

        expect(await collector().collect([candidate({ url: 'https://x/link.png' })], { targets })).toEqual({
            'file-exists': 1,
        })
        expect(await readFile(target, 'utf8')).toBe('someone else’s file')

        expect(
            await collector().collect([candidate({ url: 'https://x/link.png' })], { targets, overwrite: true }),
        ).toEqual({
            kept: 1,
        })
        expect(sha256(await readFile(target))).toBe(sha256(buffer))
    })

    it('resumes: already collected and permanently rejected URLs are not downloaded again', async () => {
        await serve('https://x/a.png', 1)
        files.set('https://x/bad.png', { buffer: Buffer.from('bad'), contentType: 'image/png' })
        const candidates = [candidate({ url: 'https://x/a.png' }), candidate({ url: 'https://x/bad.png' })]
        await collector().collect(candidates, { targets })

        const download = vi.fn<CollectorDeps['download']>()
        const reloaded = await MetadataStore.load(path.join(root, 'data', 'metadata'))
        const summary = await collector({ download, store: reloaded }).collect(candidates, { targets })

        expect(summary).toEqual({ skipped: 2 })
        expect(download).not.toHaveBeenCalled()
    })

    it('stops collecting a label once its target is reached', async () => {
        for (const seed of [1, 2, 3]) await serve(`https://x/${seed}.png`, seed)
        const download = vi.fn((url: string) => Promise.resolve(files.get(url) as Downloaded))

        await collector({ download }).collect(
            [1, 2, 3].map((seed) => candidate({ url: `https://x/${seed}.png` })),
            { targets: { ...targets, link: 2 } },
        )

        expect(store.countByLabel('link')).toBe(2)
        expect(download).toHaveBeenCalledTimes(2)
    })
})

describe('slugify', () => {
    it('turns a source title into a safe, readable filename part', () => {
        expect(slugify('File:Fanime 2023 – Zelda (Breath of the Wild) Cosplay.JPG')).toBe(
            'fanime-2023-zelda-breath-of-the-wild-cosplay',
        )
        expect(slugify('File:Hyrule Café ½.png')).toBe('hyrule-cafe-1-2')
    })
})
