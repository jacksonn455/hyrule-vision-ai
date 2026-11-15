import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MetadataStore } from './metadata-store.ts'
import { relocateImage } from './relocate.ts'
import { candidate } from './test-fixtures.ts'

describe('relocateImage', () => {
    let root: string
    let rawDir: string
    let store: MetadataStore
    const oldPath = 'data/raw/other/other-characters/other-other-characters-saria-12345678.png'

    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'hyrule-relocate-'))
        rawDir = path.join(root, 'data', 'raw')
        store = await MetadataStore.load(path.join(root, 'data', 'metadata'))
        await mkdir(path.join(root, path.dirname(oldPath)), { recursive: true })
        await writeFile(path.join(root, oldPath), 'image')
        store.addImage({
            ...candidate({ label: 'other', subcategory: 'other-characters' }),
            filename: path.basename(oldPath),
            path: oldPath,
            format: 'png',
            width: 256,
            height: 256,
            bytes: 5,
            sha256: '12345678'.padEnd(64, '0'),
            perceptualHash: '0'.repeat(16),
            downloadedAt: '2026-10-29T00:00:00.000Z',
        })
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('moves the file to the new sub-folder and keeps the record in sync', async () => {
        const newPath = await relocateImage(store, oldPath, 'saria', rawDir, root)

        expect(newPath).toBe('data/raw/other/saria/other-saria-saria-12345678.png')
        expect(await readFile(path.join(root, newPath), 'utf8')).toBe('image')
        expect(await readdir(path.join(rawDir, 'other', 'other-characters'))).toEqual([])
        expect(store.findImage(newPath)).toMatchObject({
            subcategory: 'saria',
            filename: 'other-saria-saria-12345678.png',
        })
        expect(store.findImage(oldPath)).toBeUndefined()
    })

    it('refuses to overwrite an existing file', async () => {
        const target = path.join(rawDir, 'other', 'saria', 'other-saria-saria-12345678.png')
        await mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, 'someone else')

        await expect(relocateImage(store, oldPath, 'saria', rawDir, root)).rejects.toThrow(/already exists/)
        expect(await readFile(target, 'utf8')).toBe('someone else')
        expect(store.findImage(oldPath)).toBeDefined()
    })
})
