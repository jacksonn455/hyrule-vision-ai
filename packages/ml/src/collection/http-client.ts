export interface DownloadOptions {
    /** Extra attempts after the first one. */
    retries: number
    /** Delay before the first retry; doubles on each attempt (exponential backoff). */
    baseDelayMs: number
    /** Upper bound for our own backoff. A server's Retry-After is always honoured in full, never shortened. */
    maxDelayMs: number
    /** If a server asks to wait longer than this, give up on the URL (it is retried on the next run). */
    maxRetryAfterMs: number
    timeoutMs: number
    /** Abort downloads larger than this instead of buffering them. */
    maxBytes: number
    userAgent: string
}

export interface Downloaded {
    buffer: Buffer
    contentType: string
}

export interface DownloadDeps {
    fetch: typeof fetch
    sleep: (ms: number) => Promise<void>
}

export class DownloadError extends Error {
    readonly retryable: boolean
    readonly status?: number
    readonly retryAfterMs?: number

    constructor(message: string, retryable: boolean, status?: number, retryAfterMs?: number) {
        super(message)
        this.name = 'DownloadError'
        this.retryable = retryable
        this.status = status
        this.retryAfterMs = retryAfterMs
    }
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Returns a function that, when awaited before each request, keeps at least `minIntervalMs` between requests. */
export function createThrottle(minIntervalMs: number, wait = sleep, now = Date.now): () => Promise<void> {
    let last = -Infinity
    return async () => {
        const elapsed = now() - last
        if (elapsed < minIntervalMs) await wait(minIntervalMs - elapsed)
        last = now()
    }
}

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])

function parseRetryAfter(header: string | null): number | undefined {
    if (!header) return undefined
    const seconds = Number(header)
    if (Number.isFinite(seconds)) return seconds * 1000
    const date = Date.parse(header)
    return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}

async function readLimited(response: Response, maxBytes: number): Promise<Buffer> {
    const declared = Number(response.headers.get('content-length'))
    if (declared > maxBytes) {
        await response.body?.cancel()
        throw new DownloadError(`declared size ${declared} bytes exceeds ${maxBytes}`, false)
    }
    const chunks: Uint8Array[] = []
    let total = 0
    if (response.body) {
        for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
            total += chunk.byteLength
            if (total > maxBytes) throw new DownloadError(`download exceeds ${maxBytes} bytes`, false)
            chunks.push(chunk)
        }
    }
    return Buffer.concat(chunks)
}

async function attempt(url: string, options: DownloadOptions, deps: DownloadDeps): Promise<Downloaded> {
    let response: Response
    try {
        response = await deps.fetch(url, {
            headers: { 'User-Agent': options.userAgent },
            signal: AbortSignal.timeout(options.timeoutMs),
            redirect: 'follow',
        })
    } catch (error) {
        // DNS failure, connection reset, timeout...
        throw new DownloadError(`network error: ${(error as Error).message}`, true)
    }

    if (!response.ok) {
        await response.body?.cancel()
        throw new DownloadError(
            `HTTP ${response.status}`,
            RETRYABLE_STATUSES.has(response.status),
            response.status,
            parseRetryAfter(response.headers.get('retry-after')),
        )
    }

    return {
        buffer: await readLimited(response, options.maxBytes),
        contentType: response.headers.get('content-type') ?? '',
    }
}

/** Downloads one URL, retrying transient failures (network errors, timeouts, 429, 5xx) with backoff. */
export async function downloadWithRetry(
    url: string,
    options: DownloadOptions,
    deps: DownloadDeps = { fetch, sleep },
): Promise<Downloaded> {
    for (let attemptNumber = 0; ; attemptNumber++) {
        try {
            return await attempt(url, options, deps)
        } catch (error) {
            const downloadError =
                error instanceof DownloadError ? error : new DownloadError((error as Error).message, true)
            if (!downloadError.retryable || attemptNumber >= options.retries) throw downloadError
            // Retrying before the server's Retry-After keeps the client rate-limited (and is impolite).
            const wait =
                downloadError.retryAfterMs ?? Math.min(options.baseDelayMs * 2 ** attemptNumber, options.maxDelayMs)
            if (wait > options.maxRetryAfterMs) throw downloadError
            await deps.sleep(wait)
        }
    }
}
