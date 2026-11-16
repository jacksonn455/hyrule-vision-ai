import type { ClassificationResponse, GameModelInfo, ModelInfo } from '@hyrule/shared'

/** What the routes need from the models. Kept as an interface so tests can use a fake without loading TensorFlow. */
export interface ImageClassifier {
    /** Classes of the character model and how well each one did on the test set. */
    model: ModelInfo
    /** Optional game model (Link / Zelda art style); null when it was not trained. */
    gameModel: GameModelInfo | null
    classify(image: Buffer): Promise<ClassificationResponse>
}
