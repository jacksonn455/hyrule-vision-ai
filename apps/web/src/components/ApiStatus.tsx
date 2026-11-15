import type { ApiHealthState } from '../hooks/useApiHealth.ts'

interface ApiStatusProps {
    state: ApiHealthState
}

export function ApiStatus({ state }: ApiStatusProps) {
    switch (state.status) {
        case 'loading':
            return <p className="status">Connecting to API…</p>
        case 'offline':
            return <p className="status status--error">API offline ({state.error})</p>
        case 'online':
            return (
                <p className="status status--ok">
                    API online · model {state.health.modelLoaded ? 'loaded' : 'not trained yet'}
                </p>
            )
    }
}
