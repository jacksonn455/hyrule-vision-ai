import type { DatasetSplit } from '../paths.ts'
import type { LabeledImage } from './classes.ts'

export const SPLIT_RATIOS: Record<DatasetSplit, number> = { train: 0.7, validation: 0.15, test: 0.15 }

/** Small deterministic PRNG (mulberry32): the same seed always gives the same split, so results are reproducible. */
export function seededRandom(seed: number): () => number {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

function shuffle<T>(items: T[], random: () => number): T[] {
    const copy = [...items]
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
    }
    return copy
}

/**
 * Stratified split: each source folder (game / character) is shuffled and cut 70/15/15 on its own,
 * so every split gets the same mix of classes AND styles. Without it, e.g. all Wind Waker Zeldas could land
 * in test and the test accuracy would measure something the model never saw.
 * Tiny folders (fewer than ~4 images) go entirely to train: a validation/test of 0.4 images makes no sense.
 */
export function stratifiedSplit(images: LabeledImage[], seed = 42): Record<DatasetSplit, LabeledImage[]> {
    const random = seededRandom(seed)
    const result: Record<DatasetSplit, LabeledImage[]> = { train: [], validation: [], test: [] }
    const groups = new Map<string, LabeledImage[]>()
    for (const image of [...images].sort((a, b) => a.relativePath.localeCompare(b.relativePath))) {
        groups.set(image.group, [...(groups.get(image.group) ?? []), image])
    }
    for (const group of [...groups.keys()].sort()) {
        const items = shuffle(groups.get(group)!, random)
        const nValidation = Math.round(items.length * SPLIT_RATIOS.validation)
        const nTest = Math.round(items.length * SPLIT_RATIOS.test)
        result.validation.push(...items.slice(0, nValidation))
        result.test.push(...items.slice(nValidation, nValidation + nTest))
        result.train.push(...items.slice(nValidation + nTest))
    }
    return result
}
