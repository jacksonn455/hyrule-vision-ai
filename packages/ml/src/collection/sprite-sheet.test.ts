import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { cutSprite, findSprites } from './sprite-sheet.ts'

/** Draws filled rectangles on a sheet of the given background (RGBA). */
async function sheet(
    rects: { x: number; y: number; w: number; h: number }[],
    background: [number, number, number, number] = [0, 0, 0, 0],
    size = { width: 120, height: 60 },
): Promise<Buffer> {
    const data = Buffer.alloc(size.width * size.height * 4)
    for (let i = 0; i < size.width * size.height; i++) data.set(background, i * 4)
    for (const r of rects) {
        for (let y = r.y; y < r.y + r.h; y++) {
            for (let x = r.x; x < r.x + r.w; x++) data.set([200, 30, 30, 255], (y * size.width + x) * 4)
        }
    }
    return sharp(data, { raw: { ...size, channels: 4 } })
        .png()
        .toBuffer()
}

describe('findSprites', () => {
    it('finds each sprite on a transparent sheet, in reading order', async () => {
        const boxes = await findSprites(
            await sheet([
                { x: 60, y: 5, w: 16, h: 20 },
                { x: 5, y: 5, w: 16, h: 24 },
                { x: 5, y: 35, w: 20, h: 20 },
            ]),
        )

        expect(boxes).toEqual([
            { x: 5, y: 5, width: 16, height: 24 },
            { x: 60, y: 5, width: 16, height: 20 },
            { x: 5, y: 35, width: 20, height: 20 },
        ])
    })

    it('works on a solid background colour', async () => {
        const boxes = await findSprites(await sheet([{ x: 10, y: 10, w: 14, h: 14 }], [0, 128, 255, 255]))

        expect(boxes).toEqual([{ x: 10, y: 10, width: 14, height: 14 }])
    })

    it('merges parts separated by a small gap and drops tiny specks', async () => {
        const boxes = await findSprites(
            await sheet([
                { x: 10, y: 10, w: 12, h: 20 },
                { x: 23, y: 12, w: 3, h: 14 }, // sword, 1 px away from the body
                { x: 80, y: 40, w: 3, h: 3 }, // particle
            ]),
        )

        expect(boxes).toEqual([{ x: 10, y: 10, width: 16, height: 20 }])
    })
})

describe('cutSprite', () => {
    it('enlarges pixel art by a whole factor with nearest-neighbour, keeping transparency', async () => {
        const png = await cutSprite(
            await sheet([{ x: 5, y: 5, w: 16, h: 20 }]),
            { x: 5, y: 5, width: 16, height: 20 },
            160,
        )

        const meta = await sharp(png).metadata()
        expect([meta.width, meta.height, meta.hasAlpha]).toEqual([160, 200, true])
        const { data } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
        expect([...data.subarray(0, 4)]).toEqual([200, 30, 30, 255])
    })
})
