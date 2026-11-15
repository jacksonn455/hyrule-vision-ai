import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { DuplicateIndex } from './duplicate-index.ts'
import { hammingDistance, perceptualHash, sha256 } from './hashing.ts'
import { blockImage } from './test-fixtures.ts'

async function indexEntry(buffer: Buffer, ref: string) {
    return { sha256: sha256(buffer), perceptualHash: await perceptualHash(buffer), ref }
}

describe('hashing', () => {
    it('gives byte-identical files the same SHA-256 and different files different ones', async () => {
        const image = await blockImage(1)

        expect(sha256(image)).toBe(sha256(Buffer.from(image)))
        expect(sha256(image)).not.toBe(sha256(await blockImage(2)))
    })

    it('gives a resized, re-encoded copy a nearly identical perceptual hash', async () => {
        const original = await blockImage(1, { width: 400, height: 300 })
        const copy = await sharp(original).resize(200).jpeg({ quality: 60 }).toBuffer()

        expect(hammingDistance(await perceptualHash(original), await perceptualHash(copy))).toBeLessThanOrEqual(2)
    })

    it('gives different pictures distant perceptual hashes', async () => {
        const distance = hammingDistance(
            await perceptualHash(await blockImage(1)),
            await perceptualHash(await blockImage(4)),
        )

        expect(distance).toBeGreaterThan(10)
    })

    it('counts differing bits', () => {
        expect(hammingDistance('0000000000000000', '0000000000000000')).toBe(0)
        expect(hammingDistance('0000000000000000', '000000000000000f')).toBe(4)
        expect(hammingDistance('ffffffffffffffff', '0000000000000000')).toBe(64)
    })
})

describe('DuplicateIndex', () => {
    it('detects an exact duplicate', async () => {
        const index = new DuplicateIndex()
        const image = await blockImage(1)
        index.add(await indexEntry(image, 'raw/link/a.png'))

        const entry = await indexEntry(Buffer.from(image), 'b')

        expect(index.findDuplicate(entry.sha256, entry.perceptualHash)).toEqual({
            kind: 'exact',
            ref: 'raw/link/a.png',
            distance: 0,
        })
    })

    it('detects a near duplicate (same picture, other size and format)', async () => {
        const index = new DuplicateIndex()
        const original = await blockImage(3, { width: 512, height: 384 })
        index.add(await indexEntry(original, 'raw/zelda/a.png'))

        const copy = await indexEntry(await sharp(original).resize(256).webp().toBuffer(), 'b')

        expect(index.findDuplicate(copy.sha256, copy.perceptualHash)).toMatchObject({
            kind: 'near',
            ref: 'raw/zelda/a.png',
        })
    })

    it('does not flag different pictures', async () => {
        const index = new DuplicateIndex()
        index.add(await indexEntry(await blockImage(1), 'a'))

        const other = await indexEntry(await blockImage(5), 'b')

        expect(index.findDuplicate(other.sha256, other.perceptualHash)).toBeUndefined()
    })

    it('forgets removed entries', async () => {
        const index = new DuplicateIndex()
        const entry = await indexEntry(await blockImage(1), 'a')
        index.add(entry)
        index.remove(entry.sha256)

        expect(index.size).toBe(0)
        expect(index.findDuplicate(entry.sha256, entry.perceptualHash)).toBeUndefined()
    })
})
