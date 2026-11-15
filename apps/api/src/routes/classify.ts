import type { FastifyInstance } from 'fastify'

import type { ApiErrorResponse, ClassificationResponse } from '@hyrule/shared'

import type { ImageClassifier } from '../classifier.ts'

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/**
 * POST /api/classify — the body is the image itself (Content-Type: image/jpeg | image/png | image/webp).
 * Sending raw bytes instead of multipart keeps the API dependency-free: one request = one image.
 */
export function registerClassifyRoutes(app: FastifyInstance, classifier: ImageClassifier | null): void {
    app.addContentTypeParser(
        [...ACCEPTED_IMAGE_TYPES],
        { parseAs: 'buffer', bodyLimit: MAX_IMAGE_BYTES },
        (_request, body, done) => done(null, body),
    )

    app.post<{ Body: Buffer; Reply: ClassificationResponse | ApiErrorResponse }>(
        '/api/classify',
        async (request, reply) => {
            if (!classifier) {
                return reply.code(503).send({
                    error: 'ModelNotLoaded',
                    message: 'No trained model found. Run `npm run ml:train` and restart the API.',
                })
            }
            if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
                return reply.code(415).send({
                    error: 'UnsupportedMediaType',
                    message: `Send the image as the request body with Content-Type ${ACCEPTED_IMAGE_TYPES.join(', ')}.`,
                })
            }
            try {
                return await classifier.classify(request.body)
            } catch (error) {
                request.log.warn({ err: error }, 'could not decode image')
                return reply
                    .code(422)
                    .send({ error: 'InvalidImage', message: 'The file could not be read as an image.' })
            }
        },
    )
}
