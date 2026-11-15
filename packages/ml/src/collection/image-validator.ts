import sharp from 'sharp'

import type { ImageFormat, RejectionReason } from './types.ts'

export interface ImageLimits {
    /** Shortest side in pixels. Rejects thumbnails, icons and tiny sprites that carry almost no information. */
    minSide: number
    /** File size in bytes. */
    maxBytes: number
    /** width × height. Protects RAM: sharp decodes the whole bitmap. */
    maxPixels: number
}

export const DEFAULT_IMAGE_LIMITS: ImageLimits = {
    minSide: 160,
    maxBytes: 12 * 1024 * 1024,
    maxPixels: 40_000_000,
}

export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const

const EXTENSION_BY_FORMAT: Record<ImageFormat, string> = { jpeg: '.jpg', png: '.png', webp: '.webp' }

export type ValidationResult =
    | { ok: true; format: ImageFormat; width: number; height: number }
    | { ok: false; reason: RejectionReason; detail: string }

export function extensionForFormat(format: ImageFormat): string {
    return EXTENSION_BY_FORMAT[format]
}

/** Checks the extension in a URL or filename. The real format is checked later from the bytes. */
export function hasAllowedExtension(urlOrName: string): boolean {
    const pathname = urlOrName.split(/[?#]/)[0]!.toLowerCase()
    return ALLOWED_EXTENSIONS.some((extension) => pathname.endsWith(extension))
}

function isFormat(format: string | undefined): format is ImageFormat {
    return format === 'jpeg' || format === 'png' || format === 'webp'
}

/** Error pages are often served with status 200: catch HTML/XML/JSON before handing bytes to the decoder. */
function looksLikeText(buffer: Buffer): boolean {
    const head = buffer.subarray(0, 64).toString('utf8').trimStart().toLowerCase()
    return head.startsWith('<') || head.startsWith('{')
}

/**
 * Validates the actual content of a downloaded file, never trusting its extension or Content-Type.
 * Cheap checks run first; the full decode (the expensive part) runs last, on a downscaled output.
 */
export async function validateImage(
    buffer: Buffer,
    limits: ImageLimits = DEFAULT_IMAGE_LIMITS,
): Promise<ValidationResult> {
    if (buffer.length === 0) return { ok: false, reason: 'not-an-image', detail: 'empty file' }
    if (buffer.length > limits.maxBytes) {
        return { ok: false, reason: 'too-large', detail: `${buffer.length} bytes > ${limits.maxBytes}` }
    }
    if (looksLikeText(buffer)) return { ok: false, reason: 'not-an-image', detail: 'content is text (HTML/XML/JSON)' }

    const metadata = await sharp(buffer)
        .metadata()
        .catch((error: unknown) => (error instanceof Error ? error : new Error(String(error))))
    if (metadata instanceof Error) return { ok: false, reason: 'not-an-image', detail: metadata.message }

    const { format, width, height, pages } = metadata
    if (!isFormat(format)) return { ok: false, reason: 'unsupported-format', detail: `format: ${format}` }
    if ((pages ?? 1) > 1) return { ok: false, reason: 'unsupported-format', detail: 'animated image' }
    if (Math.min(width, height) < limits.minSide) {
        return { ok: false, reason: 'too-small', detail: `${width}x${height}, min side ${limits.minSide}` }
    }
    if (width * height > limits.maxPixels) {
        return { ok: false, reason: 'too-large', detail: `${width}x${height} > ${limits.maxPixels} pixels` }
    }

    try {
        // Decoding every pixel is the only way to detect truncated or corrupted data.
        await sharp(buffer, { failOn: 'truncated' }).resize(64, 64, { fit: 'inside' }).raw().toBuffer()
    } catch (error) {
        return { ok: false, reason: 'corrupted', detail: (error as Error).message }
    }

    return { ok: true, format, width, height }
}
