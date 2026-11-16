import { displayName, type ClassificationResponse, type ClassProbability } from '@hyrule/shared'

export type ClassificationState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'done'; result: ClassificationResponse }

interface ResultsPanelProps {
    state: ClassificationState
    /** Classes of the loaded model, shown as empty bars before the first classification. */
    labels: string[]
}

const percent = (p: number) => `${(p * 100).toFixed(1)}%`

function ProbabilityBars({
    probabilities,
    top,
}: {
    probabilities: (ClassProbability | { label: string; probability: null })[]
    top: string | null
}) {
    return (
        <ul className="results">
            {probabilities.map(({ label, probability }) => (
                <li key={label} className="results__row">
                    <span className="results__label">{displayName(label)}</span>
                    <span
                        className="results__bar"
                        role="meter"
                        aria-label={`${displayName(label)} probability`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={probability === null ? 0 : Math.round(probability * 100)}
                    >
                        <span
                            className={`results__fill${label === top ? ' results__fill--top' : ''}`}
                            style={{ width: `${(probability ?? 0) * 100}%` }}
                        />
                    </span>
                    <span className="results__value">{probability === null ? '—' : percent(probability)}</span>
                </li>
            ))}
        </ul>
    )
}

export function ResultsPanel({ state, labels }: ResultsPanelProps) {
    const result = state.status === 'done' ? state.result : null
    const top = result?.probabilities[0]
    const game = result?.game ?? null

    return (
        <section className="card">
            <h2>2. Classification</h2>
            {state.status === 'idle' && <p className="muted">Upload an image to see how the model classifies it.</p>}
            {state.status === 'loading' && <p className="muted">Classifying…</p>}
            {state.status === 'error' && <p className="status status--error">{state.message}</p>}
            {result && top && (
                <div className="prediction">
                    <p className="prediction__name">
                        {displayName(result.prediction)} <span className="muted">· {percent(top.probability)}</span>
                    </p>
                    {game && (
                        <p className="prediction__game">
                            {displayName(game.prediction)}{' '}
                            <span className="muted">· {percent(game.probabilities[0]!.probability)}</span>
                        </p>
                    )}
                </div>
            )}
            <ProbabilityBars
                probabilities={result ? result.probabilities : labels.map((label) => ({ label, probability: null }))}
                top={result?.prediction ?? null}
            />
            {game && (
                <details className="game-details">
                    <summary>Game probabilities</summary>
                    <ProbabilityBars probabilities={game.probabilities} top={game.prediction} />
                </details>
            )}
        </section>
    )
}
