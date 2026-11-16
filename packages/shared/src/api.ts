/** Test-set quality of one class, measured once after training (images the model never trained on). */
export interface ClassInfo {
    /** Folder name, e.g. "skull-kid" or "wind-waker". */
    label: string
    /** Of the test images that really are this class, how many were found (0..1). */
    recall: number
    /** Of the test images predicted as this class, how many really were (0..1). */
    precision: number
    /** Test images of this class. Small numbers (1–3) make recall/precision very noisy. */
    testImages: number
    /** Images the model trained on for this class. */
    trainImages: number
}

export interface ModelInfo {
    trainedAt: string
    /** Overall test accuracy (0..1). */
    accuracy: number
    /** In output-layer order. */
    classes: ClassInfo[]
}

export interface GameModelInfo extends ModelInfo {
    /** Characters whose images (per-game sub-folders) trained the game model; the game is only shown for them. */
    characters: string[]
}

export interface HealthResponse {
    status: 'ok'
    /** False until a character model has been trained and loaded by the API. */
    modelLoaded: boolean
    /** Character classes the loaded model predicts ([] without a model). */
    labels: string[]
    model: ModelInfo | null
    /** Optional second model that guesses the game (art style) of Link / Zelda images. */
    gameModel: GameModelInfo | null
}

/** Probability the model assigns to one class. All probabilities of a prediction sum to 1 (softmax). */
export interface ClassProbability {
    label: string
    probability: number
}

export interface Prediction {
    /** The class with the highest probability. */
    prediction: string
    /** Every class, sorted from most to least likely. */
    probabilities: ClassProbability[]
}

export interface ClassificationResponse extends Prediction {
    /** Which game the image looks like; null when there is no game model or the character has no game data. */
    game: Prediction | null
}

export interface ApiErrorResponse {
    error: string
    message: string
}
