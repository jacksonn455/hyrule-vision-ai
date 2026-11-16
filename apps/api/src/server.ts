import { buildApp } from './app.ts'
import type { ImageClassifier } from './classifier.ts'
import { loadConfig, loadEnvFile } from './config.ts'

loadEnvFile()
const config = loadConfig()

// TensorFlow is imported lazily so the API still starts (health + 503 on classify) when no model was trained yet.
let classifier: ImageClassifier | null = null
let modelError: string | null = null
try {
    const { loadClassifier } = await import('@hyrule/ml/classifier')
    classifier = await loadClassifier(config.modelDir, config.gameModelDir)
} catch (error) {
    modelError = (error as Error).message
}

const app = buildApp({ logger: { level: config.logLevel }, classifier })
if (classifier) {
    app.log.info(`character model: ${classifier.model.classes.map((c) => c.label).join(', ')}`)
    app.log.info(
        `game model: ${classifier.gameModel ? classifier.gameModel.classes.map((c) => c.label).join(', ') : 'not trained (npm run ml:train:games)'}`,
    )
} else app.log.warn(`no model loaded (${modelError}); run \`npm run ml:train\` first`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
        app.log.info(`${signal} received, shutting down`)
        void app.close().then(() => process.exit(0))
    })
}

await app.listen({ host: config.host, port: config.port })
