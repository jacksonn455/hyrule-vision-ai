import type { ClassificationResponse } from '@hyrule/shared'

/** What the routes need from the model. Kept as an interface so tests can use a fake without loading TensorFlow. */
export interface ImageClassifier {
    classify(image: Buffer): Promise<ClassificationResponse>
}
