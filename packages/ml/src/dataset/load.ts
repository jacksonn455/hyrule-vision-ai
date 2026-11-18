import { mkdir, open, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import tf from '@tensorflow/tfjs-node'

import { hasAllowedExtension } from '../collection/image-validator.ts'
import { DATA_DIR, type DatasetSplit, type Task, datasetClassDir, taskDatasetDir } from '../paths.ts'
import { IMAGE_CHANNELS, IMAGE_SIZE, imageToPixels } from '../preprocessing.ts'
import type { TaskClasses } from './classes.ts'

/** Bytes 0..255 → floats 0..1. Small, similar-sized inputs keep gradients stable during training. */
export function pixelsToTensor(pixels: Uint8Array): tf.Tensor3D {
    return tf.tidy(() => tf.tensor3d(pixels, [IMAGE_SIZE, IMAGE_SIZE, IMAGE_CHANNELS], 'int32').toFloat().div(255))
}

export const CLASSES_FILE = 'classes.json'

/** data/dataset/<task>/classes.json, written by split-dataset. */
export async function readTaskClasses(task: Task): Promise<TaskClasses> {
    const file = path.join(taskDatasetDir(task), CLASSES_FILE)
    try {
        return JSON.parse(await readFile(file, 'utf8')) as TaskClasses
    } catch {
        throw new Error(`${file} not found: run \`npm run ml:split-dataset\` first`)
    }
}

export const PIXELS_PER_IMAGE = IMAGE_SIZE * IMAGE_SIZE * IMAGE_CHANNELS

/**
 * A split whose images are NOT in memory: they were decoded once into data/cache/pixels/<task>-<split>.bin
 * (RGB bytes, one image after another) and are read back a chunk at a time. Memory stays at one chunk whatever the
 * dataset size, and later trainings skip the slow decoding of tens of thousands of JPEGs.
 */
export interface LoadedSplit {
    /** Class index of every image (position in `labels`). */
    indices: number[]
    files: string[]
    numClasses: number
    /** Reads the bytes of the images at these positions, in this order. */
    read: (positions: readonly number[]) => Promise<Uint8Array>
    close: () => Promise<void>
}

const PIXEL_CACHE_DIR = path.join(DATA_DIR, 'cache', 'pixels')

interface CacheManifest {
    imageSize: number
    labels: readonly string[]
    /** Every listed file, readable or not, so a changed split is detected. */
    listed: string[]
    files: string[]
    indices: number[]
}

/** Decodes images with a few sharp calls in flight and appends them, in order, to the cache file. */
async function buildCache(binFile: string, candidates: { file: string; index: number }[]) {
    const handle = await open(binFile, 'w')
    const files: string[] = []
    const indices: number[] = []
    try {
        for (let start = 0; start < candidates.length; start += 64) {
            const batch = candidates.slice(start, start + 64)
            const decoded = await Promise.all(
                batch.map((c) =>
                    imageToPixels(c.file).catch((error: Error) => {
                        console.warn(`skipping unreadable ${c.file}: ${error.message}`)
                        return null
                    }),
                ),
            )
            for (const [i, pixels] of decoded.entries()) {
                if (!pixels) continue
                await handle.write(pixels)
                files.push(batch[i]!.file)
                indices.push(batch[i]!.index)
            }
            if (start % 6400 === 0) console.log(`  decoded ${start}/${candidates.length}`)
        }
    } finally {
        await handle.close()
    }
    return { files, indices }
}

/** Every image of a split with its class index (position in `labels`), in a stable order. */
export async function listSplit(
    task: Task,
    split: DatasetSplit,
    labels: readonly string[],
): Promise<{ file: string; index: number }[]> {
    const candidates: { file: string; index: number }[] = []
    for (const [index, label] of labels.entries()) {
        const dir = datasetClassDir(task, split, label)
        const names = await readdir(dir).catch(() => [] as string[])
        for (const name of names.filter(hasAllowedExtension).sort())
            candidates.push({ file: path.join(dir, name), index })
    }
    return candidates
}

/** Lists a split and makes sure its pixel cache is up to date (decoding only when the split changed). */
export async function loadSplit(task: Task, split: DatasetSplit, labels: readonly string[]): Promise<LoadedSplit> {
    const candidates = await listSplit(task, split, labels)
    await mkdir(PIXEL_CACHE_DIR, { recursive: true })
    const binFile = path.join(PIXEL_CACHE_DIR, `${task}-${split}.bin`)
    const manifestFile = path.join(PIXEL_CACHE_DIR, `${task}-${split}.json`)
    const listed = candidates.map((c) => path.relative(DATA_DIR, c.file))

    let manifest = await readFile(manifestFile, 'utf8')
        .then((text) => JSON.parse(text) as CacheManifest)
        .catch(() => null)
    const upToDate =
        manifest !== null &&
        manifest.imageSize === IMAGE_SIZE &&
        JSON.stringify(manifest.labels) === JSON.stringify(labels) &&
        JSON.stringify(manifest.listed) === JSON.stringify(listed)
    if (!upToDate) {
        console.log(`Decoding ${split} (${candidates.length} images) into ${path.relative(DATA_DIR, binFile)}…`)
        const built = await buildCache(binFile, candidates)
        manifest = { imageSize: IMAGE_SIZE, labels, listed, ...built }
        await writeFile(manifestFile, JSON.stringify(manifest))
    }

    const handle = await open(binFile, 'r')
    return {
        indices: manifest!.indices,
        files: manifest!.files,
        numClasses: labels.length,
        read: async (positions) => {
            const bytes = new Uint8Array(positions.length * PIXELS_PER_IMAGE)
            for (const [i, p] of positions.entries()) {
                await handle.read(bytes, i * PIXELS_PER_IMAGE, PIXELS_PER_IMAGE, p * PIXELS_PER_IMAGE)
            }
            return bytes
        },
        close: () => handle.close(),
    }
}

/** Images at `positions` (indexes into the split) → [n, 96, 96, 3] floats in [0, 1] and [n, classes] one-hot labels. */
export async function toTensors(
    split: LoadedSplit,
    positions: readonly number[],
): Promise<{ xs: tf.Tensor4D; ys: tf.Tensor2D }> {
    const bytes = await split.read(positions)
    const xs = tf.tidy(() =>
        tf
            .tensor4d(bytes, [positions.length, IMAGE_SIZE, IMAGE_SIZE, IMAGE_CHANNELS], 'int32')
            .toFloat()
            .div<tf.Tensor4D>(255),
    )
    const labels = positions.map((p) => split.indices[p]!)
    const ys = tf.tidy(() => tf.oneHot(tf.tensor1d(labels, 'int32'), split.numClasses).toFloat() as tf.Tensor2D)
    return { xs, ys }
}

/** Splits 0..n-1 (in the given order) into groups of at most `size`. */
export function chunks(order: readonly number[], size: number): number[][] {
    const out: number[][] = []
    for (let i = 0; i < order.length; i += size) out.push(order.slice(i, i + size))
    return out
}
