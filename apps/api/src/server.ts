import { buildApp } from './app.ts'
import type { ImageClassifier } from './classifier.ts'
import { loadConfig } from './config.ts'

const config = loadConfig()

// TensorFlow is imported lazily so the API still starts (health + 503 on classify) when no model was trained yet.
let classifier: ImageClassifier | null = null
let modelError: string | null = null
try {
    const { loadClassifier } = await import('@hyrule/ml/classifier')
    classifier = await loadClassifier(config.modelDir)
} catch (error) {
    modelError = (error as Error).message
}

const app = buildApp({ logger: { level: config.logLevel }, classifier })
if (classifier) app.log.info(`model loaded from ${config.modelDir ?? 'models/hyrule-cnn'}`)
else app.log.warn(`no model loaded (${modelError}); run \`npm run ml:train\` first`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
        app.log.info(`${signal} received, shutting down`)
        void app.close().then(() => process.exit(0))
    })
}

await app.listen({ host: config.host, port: config.port })
