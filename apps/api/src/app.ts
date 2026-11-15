import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify'

import type { ImageClassifier } from './classifier.ts'
import { registerClassifyRoutes } from './routes/classify.ts'
import { registerHealthRoutes } from './routes/health.ts'

export interface AppOptions extends FastifyServerOptions {
    /** null = no trained model available: /api/classify answers 503. */
    classifier?: ImageClassifier | null
}

export function buildApp({ classifier = null, ...options }: AppOptions = {}): FastifyInstance {
    const app = Fastify(options)

    registerHealthRoutes(app, classifier !== null)
    registerClassifyRoutes(app, classifier)

    return app
}
