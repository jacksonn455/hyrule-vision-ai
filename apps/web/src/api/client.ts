import type { ApiErrorResponse, ClassificationResponse, HealthResponse } from '@hyrule/shared'

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
    const response = await fetch('/api/health', { signal: signal ?? null })
    if (!response.ok) {
        throw new Error(`API responded with ${response.status}`)
    }
    return (await response.json()) as HealthResponse
}

/** Sends the image bytes as the request body; the Content-Type tells the API which format it is. */
export async function classifyImage(file: File, signal?: AbortSignal): Promise<ClassificationResponse> {
    const response = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
        signal: signal ?? null,
    })
    if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiErrorResponse | null
        throw new Error(body?.message ?? `API responded with ${response.status}`)
    }
    return (await response.json()) as ClassificationResponse
}
