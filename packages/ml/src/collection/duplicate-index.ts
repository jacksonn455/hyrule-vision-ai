import { hammingDistance } from './hashing.ts'

export interface IndexedImage {
    sha256: string
    perceptualHash: string
    /** Where the image lives (filename or path), reported when a later image duplicates it. */
    ref: string
}

export interface DuplicateMatch {
    kind: 'exact' | 'near'
    ref: string
    distance: number
}

/**
 * Up to this many differing bits (of 64) counts as the same picture. Measured on resized/re-encoded copies,
 * which land at 0–4; unrelated photos are usually above 20.
 */
export const DEFAULT_NEAR_DUPLICATE_THRESHOLD = 5

/** In-memory index of every image already in the dataset. A few hundred entries: a linear scan is enough. */
export class DuplicateIndex {
    private readonly bySha = new Map<string, IndexedImage>()
    private readonly entries: IndexedImage[] = []
    private readonly nearThreshold: number

    constructor(nearThreshold = DEFAULT_NEAR_DUPLICATE_THRESHOLD) {
        this.nearThreshold = nearThreshold
    }

    get size(): number {
        return this.entries.length
    }

    add(image: IndexedImage): void {
        if (this.bySha.has(image.sha256)) return
        this.bySha.set(image.sha256, image)
        this.entries.push(image)
    }

    remove(sha256: string): void {
        const image = this.bySha.get(sha256)
        if (!image) return
        this.bySha.delete(sha256)
        this.entries.splice(this.entries.indexOf(image), 1)
    }

    findDuplicate(sha256: string, perceptualHash: string): DuplicateMatch | undefined {
        const exact = this.bySha.get(sha256)
        if (exact) return { kind: 'exact', ref: exact.ref, distance: 0 }

        let best: DuplicateMatch | undefined
        for (const entry of this.entries) {
            const distance = hammingDistance(perceptualHash, entry.perceptualHash)
            if (distance <= this.nearThreshold && (!best || distance < best.distance)) {
                best = { kind: 'near', ref: entry.ref, distance }
            }
        }
        return best
    }
}
