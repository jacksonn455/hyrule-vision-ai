export interface ApiConfig {
    host: string
    port: number
    logLevel: string
    /** Folder with model.json; undefined = models/hyrule-cnn. */
    modelDir: string | undefined
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
    const port = Number(env.PORT ?? 3333)
    if (!Number.isInteger(port) || port <= 0) {
        throw new Error(`Invalid PORT: ${env.PORT}`)
    }

    return {
        host: env.HOST ?? '127.0.0.1',
        port,
        logLevel: env.LOG_LEVEL ?? 'info',
        modelDir: env.MODEL_DIR,
    }
}
