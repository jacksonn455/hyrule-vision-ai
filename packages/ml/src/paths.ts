import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * - train:      images the network learns from (weights are updated on them).
 * - validation: images checked after every epoch to tune hyperparameters and detect overfitting.
 * - test:       images kept aside until the very end to estimate real-world accuracy once.
 */
export const DATASET_SPLITS = ['train', 'validation', 'test'] as const

export type DatasetSplit = (typeof DATASET_SPLITS)[number]

/**
 * Two independent CNNs are trained from the same raw images:
 * - characters: who is in the image (link, zelda, midna, …, other).
 * - games:      which game/art style a Link or Zelda image comes from (from data/raw/<character>/<game>/).
 */
export const TASKS = ['characters', 'games'] as const

export type Task = (typeof TASKS)[number]

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
export const DATA_DIR = path.join(REPO_ROOT, 'data')
export const RAW_DATA_DIR = path.join(DATA_DIR, 'raw')
export const DATASET_DIR = path.join(DATA_DIR, 'dataset')
export const MODELS_DIR = path.join(REPO_ROOT, 'models')

/** models/hyrule-cnn (characters, the main model) and models/hyrule-cnn-games. */
export const MODEL_DIRS: Record<Task, string> = {
    characters: path.join(MODELS_DIR, 'hyrule-cnn'),
    games: path.join(MODELS_DIR, 'hyrule-cnn-games'),
}

/** e.g. data/dataset/characters */
export function taskDatasetDir(task: Task): string {
    return path.join(DATASET_DIR, task)
}

/** e.g. data/dataset/characters/train/link */
export function datasetClassDir(task: Task, split: DatasetSplit, label: string): string {
    return path.join(taskDatasetDir(task), split, label)
}
