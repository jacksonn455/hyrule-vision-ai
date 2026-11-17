import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import tf from '@tensorflow/tfjs-node'

import { hasAllowedExtension } from '../collection/image-validator.ts'
import { type DatasetSplit, type Task, datasetClassDir, taskDatasetDir } from '../paths.ts'
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

export interface LoadedSplit {
    /**
     * Every image as RGB bytes, one after another (n × 96 × 96 × 3). Bytes, not floats: 30 000 images are ~830 MB
     * as bytes but 3.3 GB as float32, which does not fit in memory. `toTensors` converts a few thousand at a time.
     */
    pixels: Uint8Array
    /** Class index of every image (position in `labels`). */
    indices: number[]
    files: string[]
    numClasses: number
}

/** Decodes images with a few sharp calls in flight (sharp works on its own threads). */
async function decodeAll(files: string[], concurrency = 8): Promise<(Uint8Array | null)[]> {
    const out: (Uint8Array | null)[] = Array.from({ length: files.length }, () => null)
    let next = 0
    await Promise.all(
        Array.from({ length: concurrency }, async () => {
            while (next < files.length) {
                const i = next++
                try {
                    out[i] = await imageToPixels(files[i]!)
                } catch (error) {
                    console.warn(`skipping unreadable ${files[i]}: ${(error as Error).message}`)
                }
            }
        }),
    )
    return out
}

/** Loads a whole split as bytes. Unreadable images are skipped, not fatal. */
export async function loadSplit(task: Task, split: DatasetSplit, labels: readonly string[]): Promise<LoadedSplit> {
    const candidates: { file: string; index: number }[] = []
    for (const [index, label] of labels.entries()) {
        const dir = datasetClassDir(task, split, label)
        const names = await readdir(dir).catch(() => [] as string[])
        for (const name of names.filter(hasAllowedExtension).sort())
            candidates.push({ file: path.join(dir, name), index })
    }
    const decoded = await decodeAll(candidates.map((c) => c.file))
    const kept = candidates.map((c, i) => ({ ...c, pixels: decoded[i] })).filter((c) => c.pixels)
    const pixels = new Uint8Array(kept.length * PIXELS_PER_IMAGE)
    kept.forEach((c, i) => pixels.set(c.pixels!, i * PIXELS_PER_IMAGE))
    return { pixels, indices: kept.map((c) => c.index), files: kept.map((c) => c.file), numClasses: labels.length }
}

/** Images at `positions` (indexes into the split) → [n, 96, 96, 3] floats in [0, 1] and [n, classes] one-hot labels. */
export function toTensors(split: LoadedSplit, positions: readonly number[]): { xs: tf.Tensor4D; ys: tf.Tensor2D } {
    const bytes = new Uint8Array(positions.length * PIXELS_PER_IMAGE)
    positions.forEach((p, i) =>
        bytes.set(split.pixels.subarray(p * PIXELS_PER_IMAGE, (p + 1) * PIXELS_PER_IMAGE), i * PIXELS_PER_IMAGE),
    )
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
