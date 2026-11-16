import type { FastifyInstance } from 'fastify'

import type { HealthResponse } from '@hyrule/shared'

import type { ImageClassifier } from '../classifier.ts'

/** GET /api/health — API status plus the trained classes and their test metrics, so the UI can list them. */
export function registerHealthRoutes(app: FastifyInstance, classifier: ImageClassifier | null): void {
    app.get('/api/health', (): HealthResponse => ({
        status: 'ok',
        modelLoaded: classifier !== null,
        labels: classifier?.model.classes.map((c) => c.label) ?? [],
        model: classifier?.model ?? null,
        gameModel: classifier?.gameModel ?? null,
    }))
}
