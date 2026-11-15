import { crc32, deflateRawSync } from 'node:zlib'

import sharp from 'sharp'

import type { ImageCandidate } from './types.ts'

/**
 * A synthetic "photo": a 4×4 grid of blocks whose brightness depends on `seed`.
 * Two seeds give visually different images; the same seed at another size or format gives a near copy.
 */
interface BlockImageOptions {
    width?: number
    height?: number
    format?: 'png' | 'jpeg' | 'webp' | 'gif'
}

export async function blockImage(
    seed: number,
    { width = 256, height = 256, format = 'png' }: BlockImageOptions = {},
): Promise<Buffer> {
    const pixels = Buffer.alloc(width * height * 3)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const block = Math.floor((y * 4) / height) * 4 + Math.floor((x * 4) / width)
            const blockValue = (block * 37 * (seed + 1) + seed * 101) % 256
            // A gentle gradient: real photos have no perfectly flat areas, which make difference hashes unstable.
            const value = Math.round(blockValue * 0.7 + (x / width) * 76)
            pixels.fill(value, (y * width + x) * 3, (y * width + x) * 3 + 3)
        }
    }
    return sharp(pixels, { raw: { width, height, channels: 3 } })
        .toFormat(format)
        .toBuffer()
}

export function candidate(overrides: Partial<ImageCandidate> = {}): ImageCandidate {
    return {
        url: 'https://upload.example.org/link.png',
        sourcePageUrl: 'https://commons.example.org/wiki/File:Link.png',
        sourceName: 'Test source',
        title: 'File:Link cosplay.png',
        label: 'link',
        subcategory: 'wind-waker',
        license: 'CC BY-SA 4.0',
        author: 'Jane Doe',
        attribution: 'Jane Doe, CC BY-SA 4.0',
        variant: 'original',
        contentOrigin: 'fan-made',
        ...overrides,
    }
}

/** Builds a small ZIP in memory (stored or deflated entries), so tests need no fixture files. */
export function buildStoredZip(files: Record<string, Buffer>, deflate = false): Buffer {
    const locals: Buffer[] = []
    const centrals: Buffer[] = []
    let offset = 0
    for (const [name, content] of Object.entries(files)) {
        const data = deflate ? deflateRawSync(content) : content
        const nameBytes = Buffer.from(name)
        const local = Buffer.alloc(30)
        local.writeUInt32LE(0x04034b50, 0)
        local.writeUInt16LE(deflate ? 8 : 0, 8)
        local.writeUInt32LE(crc32(content), 14)
        local.writeUInt32LE(data.length, 18)
        local.writeUInt32LE(content.length, 22)
        local.writeUInt16LE(nameBytes.length, 26)
        const central = Buffer.alloc(46)
        central.writeUInt32LE(0x02014b50, 0)
        central.writeUInt16LE(deflate ? 8 : 0, 10)
        central.writeUInt32LE(crc32(content), 16)
        central.writeUInt32LE(data.length, 20)
        central.writeUInt32LE(content.length, 24)
        central.writeUInt16LE(nameBytes.length, 28)
        central.writeUInt32LE(offset, 42)
        locals.push(local, nameBytes, data)
        centrals.push(central, nameBytes)
        offset += local.length + nameBytes.length + data.length
    }
    const directory = Buffer.concat(centrals)
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(Object.keys(files).length, 8)
    end.writeUInt16LE(Object.keys(files).length, 10)
    end.writeUInt32LE(directory.length, 12)
    end.writeUInt32LE(offset, 16)
    return Buffer.concat([...locals, directory, end])
}
