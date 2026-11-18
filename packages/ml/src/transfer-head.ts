import tf from '@tensorflow/tfjs-node'

import { FEATURE_EXTRACTOR } from './feature-extractor.ts'
import { classWeights } from './metrics.ts'

/** The only part we train on top of MobileNet: 1280 features → 256 → classes, with dropout against noisy images. */
export function buildTransferHead(numClasses: number): tf.Sequential {
    const model = tf.sequential({
        layers: [
            tf.layers.dropout({ inputShape: [FEATURE_EXTRACTOR.features], rate: 0.2 }),
            tf.layers.dense({ units: 256, activation: 'relu', kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }) }),
            tf.layers.dropout({ rate: 0.5 }),
            tf.layers.dense({ units: numClasses, activation: 'softmax' }),
        ],
    })
    model.compile({ optimizer: tf.train.adam(0.001), loss: 'categoricalCrossentropy', metrics: ['accuracy'] })
    return model
}

/**
 * How much rare classes are boosted in the loss. balanced: every class counts the same (good recall for small
 * characters, but the big ones — Link, Zelda — get under-predicted). sqrt: half-way (default). none: as-is.
 */
export const WEIGHT_MODES = ['balanced', 'sqrt', 'none'] as const
export type WeightMode = (typeof WEIGHT_MODES)[number]

export function weightsFor(
    mode: WeightMode,
    labelIndices: number[],
    numClasses: number,
): Record<number, number> | undefined {
    if (mode === 'none') return undefined
    const balanced = classWeights(labelIndices, numClasses)
    return mode === 'balanced'
        ? balanced
        : Object.fromEntries(Object.entries(balanced).map(([k, w]) => [k, Math.sqrt(w)]))
}

/** [count × 1280] features + class indices → tensors for fit()/evaluate(). */
export function featureTensors(features: Float32Array, indices: number[], numClasses: number) {
    return {
        xs: tf.tensor2d(features, [indices.length, FEATURE_EXTRACTOR.features]),
        ys: tf.tidy(() => tf.oneHot(tf.tensor1d(indices, 'int32'), numClasses).toFloat() as tf.Tensor2D),
    }
}
