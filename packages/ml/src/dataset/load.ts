import { readdir } from 'node:fs/promises'
import path from 'node:path'

import tf from '@tensorflow/tfjs-node'

import { CLASS_LABELS, type ClassLabel } from '@hyrule/shared'

import { hasAllowedExtension } from '../collection/image-validator.ts'
import { type DatasetSplit, datasetClassDir } from '../paths.ts'
import { IMAGE_CHANNELS, IMAGE_SIZE, imageToPixels } from '../preprocessing.ts'

/** Bytes 0..255 → floats 0..1. Small, similar-sized inputs keep gradients stable during training. */
export function pixelsToTensor(pixels: Uint8Array): tf.Tensor3D {
    return tf.tidy(() => tf.tensor3d(pixels, [IMAGE_SIZE, IMAGE_SIZE, IMAGE_CHANNELS], 'int32').toFloat().div(255))
}

export interface LoadedSplit {
    /** [n, IMAGE_SIZE, IMAGE_SIZE, 3] images in [0, 1]. */
    xs: tf.Tensor4D
    /** [n, 3] one-hot labels, column order = CLASS_LABELS (link = [1, 0, 0]). */
    ys: tf.Tensor2D
    labels: ClassLabel[]
    files: string[]
}

/**
 * Loads a whole split into memory. ~650 images x 96x96x3 floats ≈ 70 MB, so batching from disk is unnecessary:
 * model.fit() still feeds the network in mini-batches (`batchSize`). Unreadable images are skipped, not fatal.
 */
export async function loadSplit(split: DatasetSplit): Promise<LoadedSplit> {
    const pixels: Uint8Array[] = []
    const labels: ClassLabel[] = []
    const files: string[] = []
    for (const label of CLASS_LABELS) {
        const dir = datasetClassDir(split, label)
        for (const name of (await readdir(dir)).filter(hasAllowedExtension).sort()) {
            const file = path.join(dir, name)
            try {
                pixels.push(await imageToPixels(file))
                labels.push(label)
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
    const ys = tf.tidy(() =>
        tf
            .oneHot(
                tf.tensor1d(
                    labels.map((l) => CLASS_LABELS.indexOf(l)),
                    'int32',
                ),
                CLASS_LABELS.length,
            )
            .toFloat(),
    ) as tf.Tensor2D
    return { xs, ys, labels, files }
}
