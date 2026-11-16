import { OTHER_LABEL, displayName, type ClassInfo, type ModelInfo } from '@hyrule/shared'

/** Test recall at or above this is "good"; below it the class is still shown, marked as still learning. */
export const GOOD_RECALL = 0.7
/** With fewer test images a recall of 0% or 100% means very little. */
const FEW_TEST_IMAGES = 3

function quality(c: ClassInfo): { className: string; text: string } {
    if (c.testImages === 0) return { className: 'badge badge--muted', text: 'not measured' }
    if (c.recall >= GOOD_RECALL) return { className: 'badge badge--good', text: 'good' }
    return { className: 'badge badge--low', text: 'learning' }
}

function ClassList({ classes }: { classes: ClassInfo[] }) {
    return (
        <ul className="classes">
            {classes.map((c) => {
                const q = quality(c)
                return (
                    <li key={c.label} className="classes__item">
                        <span className="classes__name">{displayName(c.label)}</span>
                        <span className="classes__score">
                            {c.testImages > 0 ? `${Math.round(c.recall * 100)}%` : '—'}
                            <span className={q.className}>{q.text}</span>
                        </span>
                        <span className="classes__meta muted">
                            {c.trainImages} train · {c.testImages} test
                            {c.testImages > 0 && c.testImages < FEW_TEST_IMAGES ? ' (too few to trust)' : ''}
                        </span>
                    </li>
                )
            })}
        </ul>
    )
}

interface TrainedClassesProps {
    model: ModelInfo
    gameModel: (ModelInfo & { characters: string[] }) | null
}

/**
 * Every class the current models were trained on, with how often each one was recognised in the test set
 * (recall). Low scores are shown too: add images to data/raw/<character> and retrain to raise them.
 */
export function TrainedClasses({ model, gameModel }: TrainedClassesProps) {
    const characters = model.classes.filter((c) => c.label !== OTHER_LABEL)
    return (
        <section className="card">
            <h2>Trained characters</h2>
            <p className="muted">
                {characters.length} characters · overall test accuracy {Math.round(model.accuracy * 100)}%. The
                percentage is how many test images of each one the model recognised.
            </p>
            <ClassList classes={model.classes} />
            {gameModel && (
                <>
                    <h2 className="section-title">Trained games</h2>
                    <p className="muted">
                        Shown under the name for {gameModel.characters.map(displayName).join(' and ')} · overall test
                        accuracy {Math.round(gameModel.accuracy * 100)}%.
                    </p>
                    <ClassList classes={gameModel.classes} />
                </>
            )}
        </section>
    )
}
