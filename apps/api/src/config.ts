import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** apps/api/.env, resolved from this file so it works whatever the current directory is. */
export const ENV_FILE = fileURLToPath(new URL('../.env', import.meta.url))

/**
 * Loads apps/api/.env into process.env when it exists. The file is optional: every variable has a default.
 *
 * Why not `node --env-file-if-exists=.env --watch`: in watch mode Node also watches the env file and crashes
 * with ENOENT when it does not exist. Trade-off: edits to .env need a manual restart (code changes still reload).
 * Variables already set in the shell win over the file, as with --env-file.
 */
export function loadEnvFile(file = ENV_FILE): boolean {
    if (!existsSync(file)) return false
    process.loadEnvFile(file)
    return true
}

export interface ApiConfig {
    host: string
    port: number
    logLevel: string
    /** Folder with model.json; undefined = models/hyrule-cnn. */
    modelDir: string | undefined
    /** Folder with the game model; undefined = models/hyrule-cnn-games. Optional: the API works without it. */
    gameModelDir: string | undefined
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
        gameModelDir: env.GAME_MODEL_DIR,
    }
}
