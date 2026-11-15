import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { syncWithDisk } from './disk-sync.ts'
import { sha256 } from './hashing.ts'
import { MetadataStore } from './metadata-store.ts'
import { blockImage, candidate } from './test-fixtures.ts'

describe('syncWithDisk', () => {
    let root: string
    let rawDir: string
    let store: MetadataStore

    async function add(repoPath: string, seed: number) {
        const buffer = await blockImage(seed)
        await mkdir(path.join(root, path.dirname(repoPath)), { recursive: true })
        await writeFile(path.join(root, repoPath), buffer)
        const [, , label, subcategory] = repoPath.split('/') as [string, string, 'other', 'npcs']
        store.addImage({
            ...candidate({ url: `https://x/${seed}`, label, subcategory }),
            filename: path.basename(repoPath),
            path: repoPath,
            format: 'png',
            width: 256,
            height: 256,
            bytes: buffer.length,
            sha256: sha256(buffer),
            perceptualHash: '0'.repeat(16),
            downloadedAt: '2026-10-29T00:00:00.000Z',
        })
    }

    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'hyrule-sync-'))
        rawDir = path.join(root, 'data', 'raw')
        store = await MetadataStore.load(path.join(root, 'data', 'metadata'))
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('follows files moved or renamed by hand, matching them by content', async () => {
        await add('data/raw/other/npcs/other-npcs-a.png', 1)
        await mkdir(path.join(rawDir, 'other', 'malon'), { recursive: true })
        await rename(path.join(rawDir, 'other/npcs/other-npcs-a.png'), path.join(rawDir, 'other/malon/my-name.png'))

        const report = await syncWithDisk(store, rawDir, root)

        expect(report.moved).toEqual([
            { from: 'data/raw/other/npcs/other-npcs-a.png', to: 'data/raw/other/malon/my-name.png' },
        ])
        expect(store.findImage('data/raw/other/malon/my-name.png')).toMatchObject({
            subcategory: 'malon',
            filename: 'my-name.png',
        })
    })

    it('records files deleted by hand as rejected, so they are never downloaded again', async () => {
        await add('data/raw/other/enemies/other-enemies-b.png', 2)
        await rm(path.join(rawDir, 'other/enemies/other-enemies-b.png'))

        const report = await syncWithDisk(store, rawDir, root)

        expect(report.deleted).toEqual(['data/raw/other/enemies/other-enemies-b.png'])
        expect(store.allImages()).toEqual([])
        expect(store.isPermanentlyRejected('https://x/2')).toBe(true)
    })

    it('leaves records alone when a file was moved to a folder that is not a known sub-category', async () => {
        await add('data/raw/other/npcs/other-npcs-c.png', 3)
        await mkdir(path.join(rawDir, 'other', 'my-folder'), { recursive: true })
        await rename(path.join(rawDir, 'other/npcs/other-npcs-c.png'), path.join(rawDir, 'other/my-folder/c.png'))

        const report = await syncWithDisk(store, rawDir, root)

        expect(report.unknownFolder).toEqual(['data/raw/other/my-folder/c.png'])
        expect(store.findImage('data/raw/other/npcs/other-npcs-c.png')).toBeDefined()
    })
})
