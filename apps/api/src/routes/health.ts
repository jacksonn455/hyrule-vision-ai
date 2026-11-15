import type { FastifyInstance } from 'fastify'

import { CLASS_LABELS, type HealthResponse } from '@hyrule/shared'

export function registerHealthRoutes(app: FastifyInstance, modelLoaded: boolean): void {
    app.get('/api/health', (): HealthResponse => ({
        status: 'ok',
        modelLoaded,
        labels: CLASS_LABELS,
    }))
}
