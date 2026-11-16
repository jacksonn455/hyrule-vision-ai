import tf from '@tensorflow/tfjs-node'

import { IMAGE_CHANNELS, IMAGE_SIZE } from './preprocessing.ts'

/**
 * A small CNN trained from scratch. Shapes for a 96x96 input:
 *
 *   96x96x3  ─conv 3x3 x16─▶ 96x96x16 ─maxPool 2─▶ 48x48x16   edges, colour blobs
 *            ─conv 3x3 x32─▶ 48x48x32 ─maxPool 2─▶ 24x24x32   simple textures/shapes (hair, cap)
 *            ─conv 3x3 x64─▶ 24x24x64 ─maxPool 2─▶ 12x12x64   parts (face, ears, outfit)
 *            ─conv 3x3 x128▶ 12x12x128 ─maxPool 2─▶ 6x6x128   whole-character patterns
 *            ─flatten─▶ 4608 ─dense 128 relu─▶ dropout 0.5 ─dense N softmax─▶ [p(class 1), …, p(class N)]
 *
 * - conv: slides small learned filters over the image; each filter produces a "feature map".
 * - relu: keeps positives, zeroes negatives; the non-linearity that lets layers combine into complex features.
 * - maxPool: halves width/height, keeping the strongest response; cheaper and tolerant to small shifts.
 * - dropout: randomly switches off half the dense units while training, so the net can't memorise a few hundred images.
 *
 * N = number of classes, decided by the dataset (characters: link, zelda, midna, …, other; games: botw, …).
 * - softmax: turns the N scores into probabilities that sum to 1.
 */
export function buildModel(numClasses: number): tf.Sequential {
    const model = tf.sequential()
    model.add(tf.layers.inputLayer({ inputShape: [IMAGE_SIZE, IMAGE_SIZE, IMAGE_CHANNELS] }))
    for (const filters of [16, 32, 64, 128]) {
        model.add(tf.layers.conv2d({ filters, kernelSize: 3, padding: 'same', activation: 'relu' }))
        model.add(tf.layers.maxPooling2d({ poolSize: 2 }))
    }
    model.add(tf.layers.flatten())
    model.add(tf.layers.dense({ units: 128, activation: 'relu' }))
    model.add(tf.layers.dropout({ rate: 0.5 }))
    model.add(tf.layers.dense({ units: numClasses, activation: 'softmax' }))

    // categoricalCrossentropy: the loss for one-hot labels + softmax; Adam: adaptive gradient descent.
    model.compile({ optimizer: tf.train.adam(0.001), loss: 'categoricalCrossentropy', metrics: ['accuracy'] })
    return model
}
