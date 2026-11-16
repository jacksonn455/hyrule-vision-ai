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

export interface LoadedSplit {
    /** [n, IMAGE_SIZE, IMAGE_SIZE, 3] images in [0, 1]. */
    xs: tf.Tensor4D
    /** [n, classes] one-hot labels, column order = `labels` passed to loadSplit. */
    ys: tf.Tensor2D
    /** Class index of every image (position in `labels`). */
    indices: number[]
    files: string[]
}

/**
 * Loads a whole split into memory. ~1000 images x 96x96x3 floats ≈ 110 MB, so batching from disk is unnecessary:
 * model.fit() still feeds the network in mini-batches (`batchSize`). Unreadable images are skipped, not fatal.
 */
export async function loadSplit(task: Task, split: DatasetSplit, labels: readonly string[]): Promise<LoadedSplit> {
    const pixels: Uint8Array[] = []
    const indices: number[] = []
    const files: string[] = []
    for (const [index, label] of labels.entries()) {
        const dir = datasetClassDir(task, split, label)
        const names = await readdir(dir).catch(() => [] as string[])
        for (const name of names.filter(hasAllowedExtension).sort()) {
            const file = path.join(dir, name)
            try {
                pixels.push(await imageToPixels(file))
                indices.push(index)
                files.push(file)
            } catch (error) {
                console.warn(`skipping unreadable ${file}: ${(error as Error).message}`)
            }
        }
    }
    const size = IMAGE_SIZE * IMAGE_SIZE * IMAGE_CHANNELS
    const all = new Uint8Array(pixels.length * size)
    pixels.forEach((p, i) => all.set(p, i * size))
    const xs = tf.tidy(() =>
        tf
            .tensor4d(all, [pixels.length, IMAGE_SIZE, IMAGE_SIZE, IMAGE_CHANNELS], 'int32')
            .toFloat()
            .div<tf.Tensor4D>(255),
    )
    const ys = tf.tidy(() => tf.oneHot(tf.tensor1d(indices, 'int32'), labels.length).toFloat()) as tf.Tensor2D
    return { xs, ys, indices, files }
}
