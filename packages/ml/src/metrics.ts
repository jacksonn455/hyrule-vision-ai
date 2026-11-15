import { CLASS_LABELS, type ClassLabel } from '@hyrule/shared'

export interface ClassMetrics {
    /** Of the images predicted as this class, how many really were. */
    precision: number
    /** Of the images that really are this class, how many were found. */
    recall: number
    support: number
}

export interface Evaluation {
    accuracy: number
    /** confusionMatrix[actual][predicted], rows/columns in CLASS_LABELS order. */
    confusionMatrix: number[][]
    perClass: Record<ClassLabel, ClassMetrics>
}

/** Takes class indices (argMax of the softmax output) and compares them with the true ones. */
export function evaluate(actual: number[], predicted: number[]): Evaluation {
    const n = CLASS_LABELS.length
    const matrix = Array.from({ length: n }, () => Array<number>(n).fill(0))
    actual.forEach((a, i) => matrix[a]![predicted[i]!]!++)
    const correct = matrix.reduce((sum, row, i) => sum + row[i]!, 0)
    const ratio = (num: number, den: number) => (den === 0 ? 0 : num / den)
    const perClass = Object.fromEntries(
        CLASS_LABELS.map((label, c) => {
            const support = matrix[c]!.reduce((s, v) => s + v, 0)
            const predictedAsC = matrix.reduce((s, row) => s + row[c]!, 0)
            return [
                label,
                { precision: ratio(matrix[c]![c]!, predictedAsC), recall: ratio(matrix[c]![c]!, support), support },
            ]
        }),
    ) as Record<ClassLabel, ClassMetrics>
    return { accuracy: ratio(correct, actual.length), confusionMatrix: matrix, perClass }
}

/**
 * Weights that make every class count the same in the loss despite different image counts
 * (link has more images than zelda): weight = total / (classes * count).
 */
export function classWeights(labelIndices: number[]): Record<number, number> {
    const n = CLASS_LABELS.length
    const counts = Array<number>(n).fill(0)
    labelIndices.forEach((i) => counts[i]!++)
    return Object.fromEntries(counts.map((c, i) => [i, c === 0 ? 0 : labelIndices.length / (n * c)]))
}
