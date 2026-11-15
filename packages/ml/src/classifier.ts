import path from 'node:path'

import tf from '@tensorflow/tfjs-node'

import { CLASS_LABELS, type ClassificationResponse } from '@hyrule/shared'

import { pixelsToTensor } from './dataset/load.ts'
import { MODELS_DIR } from './paths.ts'
import { imageToPixels } from './preprocessing.ts'

export const DEFAULT_MODEL_DIR = path.join(MODELS_DIR, 'hyrule-cnn')

export interface ImageClassifier {
    classify(image: Buffer): Promise<ClassificationResponse>
}

/**
 * Loads the trained model once and classifies images with the SAME preprocessing used in training
 * (any difference, e.g. another resize mode, would silently hurt accuracy).
 */
export async function loadClassifier(modelDir = DEFAULT_MODEL_DIR): Promise<ImageClassifier> {
    const model = await tf.loadLayersModel(`file://${path.join(modelDir, 'model.json')}`)
    return {
        async classify(image) {
            const pixels = await imageToPixels(image)
            const scores = tf.tidy(() => {
                const batch = pixelsToTensor(pixels).expandDims(0) // the model expects a batch: [1, 96, 96, 3]
                return (model.predict(batch) as tf.Tensor2D).dataSync()
            })
            const probabilities = CLASS_LABELS.map((label, i) => ({ label, probability: scores[i]! })).sort(
                (a, b) => b.probability - a.probability,
            )
            return { prediction: probabilities[0]!.label, probabilities }
        },
    }
}
