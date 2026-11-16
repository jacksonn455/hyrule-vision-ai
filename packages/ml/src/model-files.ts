import type { ModelInfo } from '@hyrule/shared'

import type { Evaluation } from './metrics.ts'
import type { Task } from './paths.ts'

/** Next to model.json: the class names in output-layer order (written before the first weights are saved). */
export const LABELS_FILE = 'labels.json'
/** Next to model.json: test-set metrics, written when training ends. */
export const METRICS_FILE = 'metrics.json'

export interface ModelMetricsFile {
    task: Task
    trainedAt: string
    imageSize: number
    augment: boolean
    labels: string[]
    trainCounts: Record<string, number>
    /** games: the characters whose images trained the model. */
    characters: string[]
    bestEpoch: number
    bestValLoss: number
    test: Evaluation
    history: { epoch: number; loss: number; acc: number; valLoss: number; valAcc: number }[]
}

/** The part of metrics.json the API / web need to show how reliable each class is. */
export function toModelInfo(metrics: Partial<ModelMetricsFile>, labels: string[]): ModelInfo {
    return {
        trainedAt: metrics.trainedAt ?? '',
        accuracy: metrics.test?.accuracy ?? 0,
        classes: labels.map((label) => {
            const m = metrics.test?.perClass[label]
            return {
                label,
                recall: m?.recall ?? 0,
                precision: m?.precision ?? 0,
                testImages: m?.support ?? 0,
                trainImages: metrics.trainCounts?.[label] ?? 0,
            }
        }),
    }
}
