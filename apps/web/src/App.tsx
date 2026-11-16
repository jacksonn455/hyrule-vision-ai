import { useRef, useState } from 'react'

import { classifyImage } from './api/client.ts'
import { ApiStatus } from './components/ApiStatus.tsx'
import { ImageUploader } from './components/ImageUploader.tsx'
import { ResultsPanel, type ClassificationState } from './components/ResultsPanel.tsx'
import { TrainedClasses } from './components/TrainedClasses.tsx'
import { useApiHealth } from './hooks/useApiHealth.ts'

export function App() {
    const health = useApiHealth()
    const [file, setFile] = useState<File | null>(null)
    const [classification, setClassification] = useState<ClassificationState>({ status: 'idle' })
    const pending = useRef<AbortController | null>(null)

    // Classify every newly selected image; abort the previous request if the user picks another one meanwhile.
    function handleFileSelected(selected: File) {
        pending.current?.abort()
        const controller = new AbortController()
        pending.current = controller
        setFile(selected)
        setClassification({ status: 'loading' })
        classifyImage(selected, controller.signal)
            .then((result) => setClassification({ status: 'done', result }))
            .catch((error: unknown) => {
                if (controller.signal.aborted) return
                setClassification({ status: 'error', message: (error as Error).message })
            })
    }

    return (
        <main className="layout">
            <header>
                <h1>Hyrule Vision AI</h1>
                <p className="muted">
                    Convolutional neural networks, trained from scratch, that recognise Zelda characters and guess which
                    game Link or Zelda comes from.
                </p>
                <ApiStatus state={health} />
            </header>
            <div className="grid">
                <ImageUploader file={file} onFileSelected={handleFileSelected} />
                <ResultsPanel state={classification} labels={health.status === 'online' ? health.health.labels : []} />
            </div>
            {health.status === 'online' && health.health.model && (
                <div className="grid">
                    <TrainedClasses model={health.health.model} gameModel={health.health.gameModel} />
                </div>
            )}
        </main>
    )
}
