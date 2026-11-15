import { CLASS_DISPLAY_NAMES, CLASS_LABELS, type ClassificationResponse } from '@hyrule/shared'

export type ClassificationState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'done'; result: ClassificationResponse }

interface ResultsPanelProps {
    state: ClassificationState
}

export function ResultsPanel({ state }: ResultsPanelProps) {
    const probabilities =
        state.status === 'done'
            ? state.result.probabilities
            : CLASS_LABELS.map((label) => ({ label, probability: null }))

    return (
        <section className="card">
            <h2>2. Classification</h2>
            {state.status === 'idle' && <p className="muted">Upload an image to see how the model classifies it.</p>}
            {state.status === 'loading' && <p className="muted">Classifying…</p>}
            {state.status === 'error' && <p className="status status--error">{state.message}</p>}
            {state.status === 'done' && (
                <p>
                    Prediction: <strong>{CLASS_DISPLAY_NAMES[state.result.prediction]}</strong>
                </p>
            )}
            <ul className="results">
                {probabilities.map(({ label, probability }) => (
                    <li key={label} className="results__row">
                        <span className="results__label">{CLASS_DISPLAY_NAMES[label]}</span>
                        <span
                            className="results__bar"
                            role="meter"
                            aria-label={`${CLASS_DISPLAY_NAMES[label]} probability`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={probability === null ? 0 : Math.round(probability * 100)}
                        >
                            <span
                                className={`results__fill${state.status === 'done' && label === state.result.prediction ? ' results__fill--top' : ''}`}
                                style={{ width: `${(probability ?? 0) * 100}%` }}
                            />
                        </span>
                        <span className="results__value">
                            {probability === null ? '—' : `${(probability * 100).toFixed(1)}%`}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    )
}
