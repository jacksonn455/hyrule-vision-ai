import { useEffect, useRef, useState } from 'react'

import { classifyImage } from '../api/client.ts'
import { ResultsPanel, type ClassificationState } from './ResultsPanel.tsx'

/** Pause between two frames sent to the API (the next one is only sent once the previous answer arrived). */
const INTERVAL_MS = 1500

/**
 * Live mode: point the webcam at a screen (e.g. a Nintendo Switch 2) and every ~1.5 s the current frame is sent to
 * the same /api/classify endpoint as an uploaded image, so the character, its probability and — for Link — the game
 * are shown with the same results panel.
 */
export function WebcamClassifier({ labels }: { labels: string[] }) {
    const video = useRef<HTMLVideoElement>(null)
    const [stream, setStream] = useState<MediaStream | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [classification, setClassification] = useState<ClassificationState>({ status: 'idle' })

    async function start() {
        try {
            const media = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false,
            })
            setStream(media)
            setError(null)
        } catch (e) {
            setError(`Could not open the webcam: ${(e as Error).message}`)
        }
    }

    function stop() {
        stream?.getTracks().forEach((track) => track.stop())
        setStream(null)
    }

    useEffect(() => {
        if (!stream || !video.current) return
        video.current.srcObject = stream
        const controller = new AbortController()
        let timer: ReturnType<typeof setTimeout>

        // One frame → JPEG → API, then wait and repeat. Never more than one request in flight.
        async function loop() {
            const element = video.current
            if (controller.signal.aborted || !element) return
            if (element.videoWidth > 0) {
                const canvas = document.createElement('canvas')
                canvas.width = element.videoWidth
                canvas.height = element.videoHeight
                canvas.getContext('2d')!.drawImage(element, 0, 0)
                const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
                if (blob) {
                    setClassification((previous) => (previous.status === 'done' ? previous : { status: 'loading' }))
                    try {
                        const result = await classifyImage(
                            new File([blob], 'webcam.jpg', { type: 'image/jpeg' }),
                            controller.signal,
                        )
                        setClassification({ status: 'done', result })
                    } catch (e) {
                        if (controller.signal.aborted) return
                        setClassification({ status: 'error', message: (e as Error).message })
                    }
                }
            }
            timer = setTimeout(() => void loop(), INTERVAL_MS)
        }
        void loop()
        return () => {
            controller.abort()
            clearTimeout(timer)
        }
    }, [stream])

    // Release the camera when the component goes away.
    useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream])

    return (
        <>
            <section className="card webcam">
                <h2>Live webcam</h2>
                <p className="muted">
                    Point your webcam at the Nintendo Switch 2 screen: the frame is classified every{' '}
                    {INTERVAL_MS / 1000} s.
                </p>
                {stream ? (
                    <video ref={video} autoPlay playsInline muted />
                ) : (
                    <div className="webcam-placeholder muted">Camera off</div>
                )}
                <button type="button" onClick={stream ? stop : start}>
                    {stream ? 'Stop webcam' : 'Start webcam'}
                </button>
                {error && <p className="status status--error">{error}</p>}
            </section>
            <ResultsPanel state={classification} labels={labels} />
        </>
    )
}
