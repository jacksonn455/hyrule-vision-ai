import { useState, type ChangeEvent, type DragEvent } from 'react'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

interface ImageUploaderProps {
    file: File | null
    onFileSelected: (file: File) => void
}

export function ImageUploader({ file, onFileSelected }: ImageUploaderProps) {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    function handleFile(candidate: File | undefined) {
        if (!candidate) return
        if (!ACCEPTED_TYPES.includes(candidate.type)) {
            setError('Please choose a JPEG, PNG or WebP image.')
            return
        }
        // Object URLs hold the file in memory until revoked, so release the previous preview.
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        setPreviewUrl(URL.createObjectURL(candidate))
        setError(null)
        onFileSelected(candidate)
    }

    function handleDrop(event: DragEvent<HTMLLabelElement>) {
        event.preventDefault()
        handleFile(event.dataTransfer.files[0])
    }

    return (
        <section className="card">
            <h2>1. Choose an image</h2>
            <label className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
                {previewUrl ? (
                    <img className="dropzone__preview" src={previewUrl} alt="Selected image preview" />
                ) : (
                    <span>Drag an image here or click to browse</span>
                )}
                <input
                    type="file"
                    accept={ACCEPTED_TYPES.join(',')}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => handleFile(event.target.files?.[0])}
                    hidden
                />
            </label>
            {file && <p className="muted">{file.name}</p>}
            {error && <p className="status status--error">{error}</p>}
        </section>
    )
}
