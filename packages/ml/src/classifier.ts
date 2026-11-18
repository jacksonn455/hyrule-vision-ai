import { readFile } from 'node:fs/promises'
import path from 'node:path'

import tf from '@tensorflow/tfjs-node'

import type { ClassificationResponse, GameModelInfo, ModelInfo, Prediction } from '@hyrule/shared'

import { pixelsToTensor } from './dataset/load.ts'
import { FEATURE_EXTRACTOR, FEATURE_EXTRACTOR_DIR, extractFeatures, loadFeatureExtractor } from './feature-extractor.ts'
import { LABELS_FILE, METRICS_FILE, type ModelMetricsFile, toModelInfo } from './model-files.ts'
import { MODEL_DIRS } from './paths.ts'
import { imageToPixels } from './preprocessing.ts'

export const DEFAULT_MODEL_DIR = MODEL_DIRS.characters
export const DEFAULT_GAME_MODEL_DIR = MODEL_DIRS.games

export interface ImageClassifier {
    model: ModelInfo
    gameModel: GameModelInfo | null
    classify(image: Buffer): Promise<ClassificationResponse>
}

interface LoadedModel {
    model: tf.LayersModel
    labels: string[]
    metrics: Partial<ModelMetricsFile>
}

async function readJson<T>(file: string): Promise<T | null> {
    try {
        return JSON.parse(await readFile(file, 'utf8')) as T
    } catch {
        return null
    }
}

async function loadModel(dir: string): Promise<LoadedModel> {
    const model = await tf.loadLayersModel(`file://${path.join(dir, 'model.json')}`)
    const metrics = (await readJson<Partial<ModelMetricsFile>>(path.join(dir, METRICS_FILE))) ?? {}
    // labels.json is the source of truth; metrics.json covers models trained before it existed.
    const labels = (await readJson<string[]>(path.join(dir, LABELS_FILE))) ?? metrics.labels
    const outputs = (model.outputs[0]!.shape as number[]).at(-1)
    if (!labels || labels.length !== outputs) {
        throw new Error(`${dir}: ${labels?.length ?? 0} labels for ${outputs} model outputs; retrain the model`)
    }
    return { model, labels, metrics }
}

function predict({ model, labels }: LoadedModel, input: tf.Tensor): Prediction {
    const output = model.predict(input) as tf.Tensor2D
    const scores = output.dataSync()
    output.dispose()
    const probabilities = labels
        .map((label, i) => ({ label, probability: scores[i]! }))
        .sort((a, b) => b.probability - a.probability)
    return { prediction: probabilities[0]!.label, probabilities }
}

/**
 * Loads the trained models once and classifies images with the SAME preprocessing used in training
 * (any difference, e.g. another resize mode, would silently hurt accuracy).
 * The game model is optional: without it (or for characters it was not trained on) `game` is null.
 */
export async function loadClassifier(
    modelDir = DEFAULT_MODEL_DIR,
    gameModelDir = DEFAULT_GAME_MODEL_DIR,
    featureExtractorDir = FEATURE_EXTRACTOR_DIR,
): Promise<ImageClassifier> {
    const characters = await loadModel(modelDir)
    const games = await loadModel(gameModelDir).catch(() => null)
    const gameCharacters = new Set(games?.metrics.characters ?? [])
    // Transfer-learning models take MobileNet features as input, CNNs from scratch take the 96×96 image.
    const usesExtractor = (m: LoadedModel | null) => Boolean(m?.metrics.featureExtractor)
    const extractor =
        usesExtractor(characters) || usesExtractor(games) ? await loadFeatureExtractor(featureExtractorDir) : null

    /** The input each model expects, computed at most once per image. */
    async function inputs(image: Buffer) {
        const tensors: { cnn?: tf.Tensor4D; features?: tf.Tensor2D } = {}
        const needed = [characters, games].filter((m): m is LoadedModel => m !== null)
        if (needed.some((m) => !usesExtractor(m))) {
            const pixels = await imageToPixels(image)
            tensors.cnn = tf.tidy(() => pixelsToTensor(pixels).expandDims<tf.Tensor4D>(0)) // the model expects a batch
        }
        if (extractor && needed.some(usesExtractor)) {
            const pixels = await imageToPixels(image, FEATURE_EXTRACTOR.inputSize)
            tensors.features = extractFeatures(extractor, pixels, 1)
        }
        return tensors
    }
    const inputOf = (m: LoadedModel, t: { cnn?: tf.Tensor4D; features?: tf.Tensor2D }) =>
        (usesExtractor(m) ? t.features : t.cnn)!

    return {
        model: toModelInfo(characters.metrics, characters.labels),
        gameModel: games
            ? { ...toModelInfo(games.metrics, games.labels), characters: [...gameCharacters].sort() }
            : null,
        async classify(image) {
            const t = await inputs(image)
            try {
                const character = predict(characters, inputOf(characters, t))
                const game =
                    games && gameCharacters.has(character.prediction) ? predict(games, inputOf(games, t)) : null
                return { ...character, game }
            } finally {
                if (t.cnn) t.cnn.dispose()
                if (t.features) t.features.dispose()
            }
        },
    }
}
