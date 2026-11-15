import { createHash } from 'node:crypto'

import sharp from 'sharp'

export function sha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex')
}

/**
 * Difference hash (dHash): shrink to 9×8 grayscale and record, for each row, whether each pixel is
 * brighter than its right neighbour. That gives 64 bits that survive resizing, re-encoding and small
 * colour changes, so two copies of the same picture get (almost) the same hash while their SHA-256 differ.
 */
export async function perceptualHash(buffer: Buffer): Promise<string> {
    const pixels = await sharp(buffer).grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer()
    let bits = 0n
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const left = pixels[row * 9 + col]!
            const right = pixels[row * 9 + col + 1]!
            bits = (bits << 1n) | (left > right ? 1n : 0n)
        }
    }
    return bits.toString(16).padStart(16, '0')
}

/** Number of differing bits between two perceptual hashes (0 = visually identical, 64 = opposite). */
export function hammingDistance(hashA: string, hashB: string): number {
    let diff = BigInt(`0x${hashA}`) ^ BigInt(`0x${hashB}`)
    let count = 0
    while (diff > 0n) {
        count += Number(diff & 1n)
        diff >>= 1n
    }
    return count
}
