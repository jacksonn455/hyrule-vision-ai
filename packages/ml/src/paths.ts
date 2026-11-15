import { fileURLToPath } from 'node:url'
import path from 'node:path'

import type { ClassLabel } from '@hyrule/shared'

/**
 * - train:      images the network learns from (weights are updated on them).
 * - validation: images checked after every epoch to tune hyperparameters and detect overfitting.
 * - test:       images kept aside until the very end to estimate real-world accuracy once.
 */
export const DATASET_SPLITS = ['train', 'validation', 'test'] as const

export type DatasetSplit = (typeof DATASET_SPLITS)[number]

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
export const DATA_DIR = path.join(REPO_ROOT, 'data')
export const RAW_DATA_DIR = path.join(DATA_DIR, 'raw')
export const DATASET_DIR = path.join(DATA_DIR, 'dataset')
export const MODELS_DIR = path.join(REPO_ROOT, 'models')

/** e.g. data/dataset/train/link */
export function datasetClassDir(split: DatasetSplit, label: ClassLabel): string {
    return path.join(DATASET_DIR, split, label)
}
