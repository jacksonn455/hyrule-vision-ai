import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { IMAGE_CHANNELS, IMAGE_SIZE, imageToPixels } from './preprocessing.ts'

describe('imageToPixels', () => {
    it('resizes any image to IMAGE_SIZE x IMAGE_SIZE RGB, letterboxing with black', async () => {
        const wideRedPng = await sharp({
            create: { width: 200, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
        })
            .png()
            .toBuffer()

        const pixels = await imageToPixels(wideRedPng)

        expect(pixels.length).toBe(IMAGE_SIZE * IMAGE_SIZE * IMAGE_CHANNELS)
        const center = ((IMAGE_SIZE / 2) * IMAGE_SIZE + IMAGE_SIZE / 2) * 3
        expect([...pixels.slice(center, center + 3)]).toEqual([255, 0, 0])
        expect([...pixels.slice(0, 3)]).toEqual([0, 0, 0]) // top padding row
    })
})
