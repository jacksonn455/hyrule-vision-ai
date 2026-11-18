import { mkdir, open, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type tf from '@tensorflow/tfjs-node'

import { FEATURE_EXTRACTOR, extractFeatures } from '../feature-extractor.ts'
import { DATA_DIR, type DatasetSplit, type Task } from '../paths.ts'
import { imageToPixels } from '../preprocessing.ts'
import { listSplit } from './load.ts'

const FEATURE_CACHE_DIR = path.join(DATA_DIR, 'cache', 'features')
const BATCH = 32

export interface FeatureSplit {
    /** [count × 1280] MobileNet features, one image after another. */
    features: Float32Array
    /** Class index of every image (position in `labels`). */
    indices: number[]
    files: string[]
}

interface FeatureManifest {
    extractor: string
    labels: readonly string[]
    /** Every listed file, readable or not, so a changed split is detected. */
    listed: string[]
    files: string[]
    indices: number[]
}

/**
 * MobileNet features of every image of a split. Running MobileNet is the slow part (a few minutes per 10 000
 * images on CPU), so the features are computed once and kept in data/cache/features/<task>-<split>.bin; later
 * trainings read them in a second. The cache is rebuilt when the split or the extractor changes.
 */
export async function loadFeatures(
    task: Task,
    split: DatasetSplit,
    labels: readonly string[],
    extractor: tf.GraphModel,
): Promise<FeatureSplit> {
    const candidates = await listSplit(task, split, labels)
    await mkdir(FEATURE_CACHE_DIR, { recursive: true })
    const binFile = path.join(FEATURE_CACHE_DIR, `${task}-${split}.bin`)
    const manifestFile = path.join(FEATURE_CACHE_DIR, `${task}-${split}.json`)
    const listed = candidates.map((c) => path.relative(DATA_DIR, c.file))

    const manifest = await readFile(manifestFile, 'utf8')
        .then((text) => JSON.parse(text) as FeatureManifest)
        .catch(() => null)
    if (
        manifest &&
        manifest.extractor === FEATURE_EXTRACTOR.name &&
        JSON.stringify(manifest.labels) === JSON.stringify(labels) &&
        JSON.stringify(manifest.listed) === JSON.stringify(listed)
    ) {
        return { features: await readFloats(binFile), indices: manifest.indices, files: manifest.files }
    }

    console.log(`Extracting MobileNet features of ${split} (${candidates.length} images)…`)
    const size = FEATURE_EXTRACTOR.inputSize
    const bytesPerImage = size * size * 3
    const handle = await open(binFile, 'w')
    const files: string[] = []
    const indices: number[] = []
    const started = Date.now()
    try {
        for (let start = 0; start < candidates.length; start += BATCH) {
            const batch = candidates.slice(start, start + BATCH)
            const decoded = await Promise.all(
                batch.map((c) =>
                    imageToPixels(c.file, size).catch((error: Error) => {
                        console.warn(`skipping unreadable ${c.file}: ${error.message}`)
                        return null
                    }),
                ),
            )
            const kept = batch.filter((_, i) => decoded[i])
            if (kept.length === 0) continue
            const pixels = new Uint8Array(kept.length * bytesPerImage)
            decoded.filter((d) => d).forEach((d, i) => pixels.set(d!, i * bytesPerImage))
            const output = extractFeatures(extractor, pixels, kept.length)
            const values = (await output.data()) as Float32Array
            output.dispose()
            await handle.write(new Uint8Array(values.buffer, values.byteOffset, values.byteLength))
            for (const c of kept) {
                files.push(c.file)
                indices.push(c.index)
            }
            if ((start / BATCH) % 100 === 0) {
                const perSecond = start / ((Date.now() - started) / 1000 || 1)
                console.log(`  ${start}/${candidates.length} (${perSecond.toFixed(0)} images/s)`)
            }
        }
    } finally {
        await handle.close()
    }
    await writeFile(
        manifestFile,
        JSON.stringify({ extractor: FEATURE_EXTRACTOR.name, labels, listed, files, indices } satisfies FeatureManifest),
    )
    return { features: await readFloats(binFile), indices, files }
}

/** A Float32Array needs a 4-byte aligned buffer: copy instead of viewing the (possibly pooled) Buffer. */
async function readFloats(file: string): Promise<Float32Array> {
    const buffer = await readFile(file)
    return new Float32Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
}
