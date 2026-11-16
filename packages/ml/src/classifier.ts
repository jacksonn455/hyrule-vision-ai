import { readFile } from 'node:fs/promises'
import path from 'node:path'

import tf from '@tensorflow/tfjs-node'

import type { ClassificationResponse, GameModelInfo, ModelInfo, Prediction } from '@hyrule/shared'

import { pixelsToTensor } from './dataset/load.ts'
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

function predict({ model, labels }: LoadedModel, batch: tf.Tensor4D): Prediction {
    const output = model.predict(batch) as tf.Tensor2D
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
): Promise<ImageClassifier> {
    const characters = await loadModel(modelDir)
    const games = await loadModel(gameModelDir).catch(() => null)
    const gameCharacters = new Set(games?.metrics.characters ?? [])

    return {
        model: toModelInfo(characters.metrics, characters.labels),
        gameModel: games
            ? { ...toModelInfo(games.metrics, games.labels), characters: [...gameCharacters].sort() }
            : null,
        async classify(image) {
            const pixels = await imageToPixels(image)
            const batch = tf.tidy(() => pixelsToTensor(pixels).expandDims<tf.Tensor4D>(0)) // the model expects a batch
            try {
                const character = predict(characters, batch)
                const game = games && gameCharacters.has(character.prediction) ? predict(games, batch) : null
                return { ...character, game }
            } finally {
                batch.dispose()
            }
        },
    }
}
