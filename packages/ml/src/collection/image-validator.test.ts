import { describe, expect, it } from 'vitest'

import { hasAllowedExtension, validateImage } from './image-validator.ts'
import { blockImage } from './test-fixtures.ts'

const limits = { minSide: 160, maxBytes: 1024 * 1024, maxPixels: 4_000_000 }

describe('validateImage', () => {
    it.each(['png', 'jpeg', 'webp'] as const)(
        'accepts a valid %s image and reports its real format',
        async (format) => {
            const result = await validateImage(await blockImage(1, { format }), limits)

            expect(result).toEqual({ ok: true, format, width: 256, height: 256 })
        },
    )

    it('rejects an HTML error page served instead of an image', async () => {
        const html = Buffer.from('<!DOCTYPE html><html><body>Too many requests</body></html>')

        expect(await validateImage(html, limits)).toMatchObject({ ok: false, reason: 'not-an-image' })
    })

    it('rejects random bytes', async () => {
        expect(await validateImage(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]), limits)).toMatchObject({
            ok: false,
            reason: 'not-an-image',
        })
    })

    it('rejects an empty file', async () => {
        expect(await validateImage(Buffer.alloc(0), limits)).toMatchObject({ ok: false, reason: 'not-an-image' })
    })

    it('rejects formats outside JPEG/PNG/WebP', async () => {
        const gif = await blockImage(1, { format: 'gif' })

        expect(await validateImage(gif, limits)).toMatchObject({ ok: false, reason: 'unsupported-format' })
    })

    it('rejects thumbnails and icons below the minimum side', async () => {
        const icon = await blockImage(1, { width: 300, height: 64 })

        expect(await validateImage(icon, limits)).toMatchObject({ ok: false, reason: 'too-small' })
    })

    it('rejects files above the byte limit before decoding them', async () => {
        const image = await blockImage(1)

        expect(await validateImage(image, { ...limits, maxBytes: image.length - 1 })).toMatchObject({
            ok: false,
            reason: 'too-large',
        })
    })

    it('rejects images above the pixel limit', async () => {
        expect(await validateImage(await blockImage(1), { ...limits, maxPixels: 256 * 255 })).toMatchObject({
            ok: false,
            reason: 'too-large',
        })
    })

    it('rejects a truncated (corrupted) JPEG', async () => {
        const jpeg = await blockImage(1, { format: 'jpeg' })
        const truncated = jpeg.subarray(0, Math.floor(jpeg.length * 0.6))

        expect(await validateImage(truncated, limits)).toMatchObject({ ok: false, reason: 'corrupted' })
    })
})

describe('hasAllowedExtension', () => {
    it('accepts image extensions in any case, ignoring query strings', () => {
        expect(hasAllowedExtension('https://x.org/a/Link.JPG?download=1')).toBe(true)
        expect(hasAllowedExtension('zelda.webp')).toBe(true)
    })

    it('rejects pages, vector, animated and video files', () => {
        for (const name of ['File:Link', 'page.html', 'logo.svg', 'anim.gif', 'clip.webm', 'doc.pdf']) {
            expect(hasAllowedExtension(name)).toBe(false)
        }
    })
})
