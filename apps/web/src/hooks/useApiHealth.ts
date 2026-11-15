import { useEffect, useState } from 'react'

import type { HealthResponse } from '@hyrule/shared'

import { fetchHealth } from '../api/client.ts'

export type ApiHealthState =
    { status: 'loading' } | { status: 'online'; health: HealthResponse } | { status: 'offline'; error: string }

export function useApiHealth(): ApiHealthState {
    const [state, setState] = useState<ApiHealthState>({ status: 'loading' })

    useEffect(() => {
        const controller = new AbortController()

        fetchHealth(controller.signal)
            .then((health) => setState({ status: 'online', health }))
            .catch((error: unknown) => {
                if (controller.signal.aborted) return
                setState({ status: 'offline', error: error instanceof Error ? error.message : String(error) })
            })

        return () => controller.abort()
    }, [])

    return state
}
