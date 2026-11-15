import type { ClassLabel } from './labels.ts'

export interface HealthResponse {
    status: 'ok'
    /** False until a model has been trained and loaded by the API. */
    modelLoaded: boolean
    labels: readonly ClassLabel[]
}

/** Probability the model assigns to one class. All probabilities of a prediction sum to 1 (softmax). */
export interface ClassProbability {
    label: ClassLabel
    probability: number
}

export interface ClassificationResponse {
    /** The class with the highest probability. */
    prediction: ClassLabel
    /** Every class, sorted from most to least likely. */
    probabilities: ClassProbability[]
}

export interface ApiErrorResponse {
    error: string
    message: string
}
