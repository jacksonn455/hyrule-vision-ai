import { describe, expect, it, vi } from 'vitest'

import { createThrottle, DownloadError, downloadWithRetry } from './http-client.ts'
import type { DownloadOptions } from './http-client.ts'

const options: DownloadOptions = {
    retries: 3,
    baseDelayMs: 100,
    maxDelayMs: 1_000,
    maxRetryAfterMs: 60_000,
    timeoutMs: 5_000,
    maxBytes: 1_000,
    userAgent: 'test-agent',
}

function respond(status: number, body = 'image-bytes', headers: Record<string, string> = {}) {
    return new Response(body, { status, headers: { 'content-type': 'image/png', ...headers } })
}

function setup(...responses: (Response | Error)[]) {
    const fetchMock = vi.fn<typeof fetch>()
    for (const response of responses) {
        if (response instanceof Error) fetchMock.mockRejectedValueOnce(response)
        else fetchMock.mockResolvedValueOnce(response)
    }
    const sleepMock = vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve())
    return { deps: { fetch: fetchMock, sleep: sleepMock }, fetchMock, sleepMock }
}

describe('downloadWithRetry', () => {
    it('returns the body and content type on success, sending the User-Agent', async () => {
        const { deps, fetchMock } = setup(respond(200))

        const result = await downloadWithRetry('https://x.org/a.png', options, deps)

        expect(result.buffer.toString()).toBe('image-bytes')
        expect(result.contentType).toBe('image/png')
        expect(fetchMock.mock.calls[0]![1]!.headers).toEqual({ 'User-Agent': 'test-agent' })
    })

    it('retries server errors and network failures with exponential backoff, then succeeds', async () => {
        const { deps, fetchMock, sleepMock } = setup(respond(503), new TypeError('ECONNRESET'), respond(200))

        const result = await downloadWithRetry('https://x.org/a.png', options, deps)

        expect(result.buffer.toString()).toBe('image-bytes')
        expect(fetchMock).toHaveBeenCalledTimes(3)
        expect(sleepMock.mock.calls.map(([ms]) => ms)).toEqual([100, 200])
    })

    it("honours the server's Retry-After in full, even above our own backoff cap", async () => {
        const { deps, sleepMock } = setup(
            respond(429, '', { 'retry-after': '0.5' }),
            respond(429, '', { 'retry-after': '5' }),
            respond(200),
        )

        await downloadWithRetry('https://x.org/a.png', options, deps)

        expect(sleepMock.mock.calls.map(([ms]) => ms)).toEqual([500, 5_000])
    })

    it('gives up (without hammering) when the server asks to wait longer than maxRetryAfterMs', async () => {
        const { deps, fetchMock, sleepMock } = setup(respond(429, '', { 'retry-after': '600' }), respond(200))

        await expect(downloadWithRetry('https://x.org/a.png', options, deps)).rejects.toMatchObject({
            status: 429,
            retryAfterMs: 600_000,
        })
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(sleepMock).not.toHaveBeenCalled()
    })

    it('gives up after the configured number of retries', async () => {
        const { deps, fetchMock } = setup(respond(500), respond(500), respond(500), respond(500), respond(200))

        await expect(downloadWithRetry('https://x.org/a.png', options, deps)).rejects.toMatchObject({
            name: 'DownloadError',
            status: 500,
        })
        expect(fetchMock).toHaveBeenCalledTimes(4)
    })

    it('does not retry permanent errors such as 404', async () => {
        const { deps, fetchMock } = setup(respond(404))

        await expect(downloadWithRetry('https://x.org/a.png', options, deps)).rejects.toBeInstanceOf(DownloadError)
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('aborts downloads larger than maxBytes without retrying', async () => {
        const { deps, fetchMock } = setup(respond(200, 'x'.repeat(2_000)))

        await expect(downloadWithRetry('https://x.org/a.png', options, deps)).rejects.toThrow(/exceeds/)
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })
})

describe('createThrottle', () => {
    it('waits only for the remaining part of the interval', async () => {
        let clock = 0
        const waits: number[] = []
        const throttle = createThrottle(
            1_000,
            (ms) => {
                waits.push(ms)
                clock += ms
                return Promise.resolve()
            },
            () => clock,
        )

        await throttle()
        clock += 300
        await throttle()
        clock += 2_000
        await throttle()

        expect(waits).toEqual([700])
    })
})
