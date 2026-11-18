import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type tf from '@tensorflow/tfjs-node'

import { FEATURE_EXTRACTOR, extractFeatures } from '../feature-extractor.ts'
import { DATA_DIR, type DatasetSplit, type Task } from '../paths.ts'
import { imageToPixels } from '../preprocessing.ts'
import { listSplit } from './load.ts'

const FEATURE_CACHE_DIR = path.join(DATA_DIR, 'cache', 'features')
const STORE_BIN = path.join(FEATURE_CACHE_DIR, `${FEATURE_EXTRACTOR.name}.bin`)
const STORE_INDEX = path.join(FEATURE_CACHE_DIR, `${FEATURE_EXTRACTOR.name}.json`)
const BATCH = 32
const DIM = FEATURE_EXTRACTOR.features

/**
 * MobileNet features of every image ever seen, keyed by file name (data/raw names are unique: they contain the
 * image hash), in data/cache/features/. Running MobileNet is the slow part (~25 images/s on CPU), so each image is
 * processed once: re-splitting the dataset, moving an image to another folder or adding a few images only extracts
 * what is new.
 */
export class FeatureStore {
    private readonly rows: Map<string, number>
    private features: Float32Array

    private constructor(rows: Map<string, number>, features: Float32Array) {
        this.rows = rows
        this.features = features
    }

    static async open(): Promise<FeatureStore> {
        await mkdir(FEATURE_CACHE_DIR, { recursive: true })
        const names = await readFile(STORE_INDEX, 'utf8')
            .then((text) => JSON.parse(text) as string[])
            .catch(() => [] as string[])
        const buffer = await readFile(STORE_BIN).catch(() => Buffer.alloc(0))
        const features = new Float32Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
        // A run interrupted between the two writes leaves extra rows or names: keep only complete pairs.
        const complete = Math.min(names.length, features.length / DIM)
        const rows = new Map(names.slice(0, complete).map((name, row) => [name, row]))
        return new FeatureStore(rows, features.subarray(0, complete * DIM))
    }

    has(file: string): boolean {
        return this.rows.has(path.basename(file))
    }

    get(file: string): Float32Array {
        const row = this.rows.get(path.basename(file))
        if (row === undefined) throw new Error(`no features for ${file}`)
        return this.features.subarray(row * DIM, (row + 1) * DIM)
    }

    /** Extracts the features of the files not in the store yet. Returns the files that could not be read. */
    async add(files: readonly string[], extractor: () => Promise<tf.GraphModel>): Promise<Set<string>> {
        const missing = [...new Set(files.filter((f) => !this.has(f)))]
        const unreadable = new Set<string>()
        if (missing.length === 0) return unreadable
        console.log(`Extracting MobileNet features of ${missing.length} new images…`)
        const model = await extractor()
        const size = FEATURE_EXTRACTOR.inputSize
        const bytesPerImage = size * size * 3
        const started = Date.now()
        const newRows: Float32Array[] = []
        for (let start = 0; start < missing.length; start += BATCH) {
            const batch = missing.slice(start, start + BATCH)
            const decoded = await Promise.all(batch.map((f) => imageToPixels(f, size).catch(() => null)))
            const kept = batch.filter((f, i) => (decoded[i] ? true : (unreadable.add(f), false)))
            if (kept.length > 0) {
                const pixels = new Uint8Array(kept.length * bytesPerImage)
                decoded.filter((d) => d).forEach((d, i) => pixels.set(d!, i * bytesPerImage))
                const output = extractFeatures(model, pixels, kept.length)
                const values = new Float32Array(await output.data())
                output.dispose()
                // Rows first, then names: an interrupted run never has a name without its features.
                await appendFile(STORE_BIN, new Uint8Array(values.buffer))
                const firstRow = this.rows.size
                kept.forEach((f, i) => this.rows.set(path.basename(f), firstRow + i))
                await writeFile(STORE_INDEX, JSON.stringify([...this.rows.keys()]))
                newRows.push(values)
            }
            if ((start / BATCH) % 100 === 0 && start > 0) {
                const perSecond = start / ((Date.now() - started) / 1000)
                console.log(`  ${start}/${missing.length} (${perSecond.toFixed(0)} images/s)`)
            }
        }
        const merged = new Float32Array(this.features.length + newRows.reduce((n, r) => n + r.length, 0))
        merged.set(this.features)
        let offset = this.features.length
        for (const r of newRows) {
            merged.set(r, offset)
            offset += r.length
        }
        this.features = merged
        return unreadable
    }
}

export interface FeatureSplit {
    /** [count × 1280] MobileNet features, one image after another. */
    features: Float32Array
    /** Class index of every image (position in `labels`). */
    indices: number[]
    files: string[]
}

/** Features of the given images (extracting the new ones), packed for training. Unreadable images are skipped. */
export async function featuresOf(
    store: FeatureStore,
    images: readonly { file: string; index: number }[],
    extractor: () => Promise<tf.GraphModel>,
): Promise<FeatureSplit> {
    const unreadable = await store.add(
        images.map((i) => i.file),
        extractor,
    )
    const kept = images.filter((i) => !unreadable.has(i.file))
    const features = new Float32Array(kept.length * DIM)
    kept.forEach((image, i) => features.set(store.get(image.file), i * DIM))
    return { features, indices: kept.map((i) => i.index), files: kept.map((i) => i.file) }
}

/** Features of every image of a split of data/dataset/<task>. */
export async function loadFeatures(
    store: FeatureStore,
    task: Task,
    split: DatasetSplit,
    labels: readonly string[],
    extractor: () => Promise<tf.GraphModel>,
): Promise<FeatureSplit> {
    return featuresOf(store, await listSplit(task, split, labels), extractor)
}
