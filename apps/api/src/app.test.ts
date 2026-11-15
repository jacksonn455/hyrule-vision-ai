import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import type { ClassificationResponse, HealthResponse } from '@hyrule/shared'

import { buildApp } from './app.ts'
import type { ImageClassifier } from './classifier.ts'

const fakeClassifier: ImageClassifier = {
    classify: (image) =>
        image.toString() === 'broken'
            ? Promise.reject(new Error('bad image'))
            : Promise.resolve({
                  prediction: 'zelda',
                  probabilities: [
                      { label: 'zelda', probability: 0.7 },
                      { label: 'link', probability: 0.2 },
                      { label: 'other', probability: 0.1 },
                  ],
              }),
}

describe('API without a trained model', () => {
    let app: FastifyInstance
    // Generous timeout: the first Fastify load is slow on /mnt/c (WSL reading the Windows filesystem).
    beforeAll(() => {
        app = buildApp()
    }, 60_000)
    afterAll(() => app.close())

    it('GET /api/health reports status, model availability and the class labels', async () => {
        const response = await app.inject({ method: 'GET', url: '/api/health' })
        expect(response.statusCode).toBe(200)
        expect(response.json<HealthResponse>()).toEqual({
            status: 'ok',
            modelLoaded: false,
            labels: ['link', 'zelda', 'other'],
        })
    })

    it('POST /api/classify answers 503', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/api/classify',
            headers: { 'content-type': 'image/png' },
            payload: Buffer.from('x'),
        })
        expect(response.statusCode).toBe(503)
    })
})

describe('API with a model', () => {
    let app: FastifyInstance
    // Generous timeout: the first Fastify load is slow on /mnt/c (WSL reading the Windows filesystem).
    beforeAll(() => {
        app = buildApp({ classifier: fakeClassifier })
    }, 60_000)
    afterAll(() => app.close())

    const post = (payload: Buffer, contentType = 'image/jpeg') =>
        app.inject({ method: 'POST', url: '/api/classify', headers: { 'content-type': contentType }, payload })

    it('returns the classification of the uploaded image', async () => {
        const response = await post(Buffer.from('image bytes'))
        expect(response.statusCode).toBe(200)
        expect(response.json<ClassificationResponse>().prediction).toBe('zelda')
    })

    it('rejects other content types and undecodable images', async () => {
        expect((await post(Buffer.from('{}'), 'application/json')).statusCode).toBe(415)
        expect((await post(Buffer.from('broken'))).statusCode).toBe(422)
    })
})
