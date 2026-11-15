import { extensionForFormat } from './image-validator.ts'
import type { ImageCandidate, ImageFormat } from './types.ts'

const MAX_SLUG_LENGTH = 60

/** "File:Fanime 2023 (Zelda) Cosplay.JPG" → "fanime-2023-zelda-cosplay" */
export function slugify(text: string): string {
    return text
        .replace(/^file:/i, '')
        .replace(/\.[a-z0-9]{2,4}$/i, '')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, MAX_SLUG_LENGTH)
        .replace(/-+$/, '')
}

/**
 * Descriptive and collision-free: label + sub-category say what it is, the slug says where it came from,
 * and the first 8 hex chars of the SHA-256 make two different images with the same title distinct.
 * e.g. "link-breath-of-the-wild-fanime-2023-05-27-0324-1a2b3c4d.jpg"
 */
export function buildImageFilename(
    candidate: Pick<ImageCandidate, 'label' | 'subcategory' | 'title'>,
    sha256: string,
    format: ImageFormat,
): string {
    const slug = slugify(candidate.title) || 'image'
    return `${candidate.label}-${candidate.subcategory}-${slug}-${sha256.slice(0, 8)}${extensionForFormat(format)}`
}
