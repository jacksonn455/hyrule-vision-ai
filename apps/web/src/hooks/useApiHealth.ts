import { useEffect, useState } from 'react'

import type { HealthResponse } from '@hyrule/shared'

import { fetchHealth } from '../api/client.ts'

export type ApiHealthState =
    { status: 'loading' } | { status: 'online'; health: HealthResponse } | { status: 'offline'; error: string }

/** While the API is unreachable (e.g. still loading the model at `npm run dev`), check again this often. */
const RETRY_MS = 3000

export function useApiHealth(): ApiHealthState {
    const [state, setState] = useState<ApiHealthState>({ status: 'loading' })

    useEffect(() => {
        const controller = new AbortController()
        let retry: ReturnType<typeof setTimeout> | undefined

        function check() {
            fetchHealth(controller.signal)
                .then((health) => setState({ status: 'online', health }))
                .catch((error: unknown) => {
                    if (controller.signal.aborted) return
                    setState({ status: 'offline', error: error instanceof Error ? error.message : String(error) })
                    retry = setTimeout(check, RETRY_MS)
                })
        }
        check()

        return () => {
            controller.abort()
            clearTimeout(retry)
        }
    }, [])

    return state
}
