import type { ClassLabel } from '@hyrule/shared'

import type { RawSubcategory } from './taxonomy.ts'

/** An image we are allowed to download, with everything needed to file and credit it. */
export interface ImageCandidate {
    /** Stable identity of the image at its source, used to resume and to audit. Usually the direct file URL. */
    url: string
    /** Where to fetch the bytes, when it differs from `url` (e.g. a signed URL that expires). */
    downloadUrl?: string
    /** Human-readable page describing the image and its license. Absent when unknown (never invented). */
    sourcePageUrl?: string
    /** URL of the original, full image at its first publisher (e.g. the artist's post), when the source records it. */
    originalImageUrl?: string
    /** e.g. "Wikimedia Commons" */
    sourceName: string
    /** Original title, used to build a descriptive filename. */
    title: string
    label: ClassLabel
    subcategory: RawSubcategory
    /** Short license name, e.g. "CC BY-SA 4.0". */
    license: string
    licenseUrl?: string
    author?: string
    /** Credit line to reproduce wherever the image is shown, or `null` if the license does not require one. */
    attribution: string | null
    /**
     * "original": the file as uploaded. "rendition": a resized or re-encoded copy served by the source, used when
     * the original is too heavy or not offered for download.
     */
    variant: 'original' | 'rendition'
    contentOrigin: ContentOrigin
    /** Name of the file before import, for images added by hand. */
    originalFilename?: string
    /** For frames cut out of a sprite sheet: the sheet they come from. */
    derivedFrom?: { path: string; sha256: string }
}

/**
 * - official: game content made by Nintendo (screenshots, sprites, official artwork).
 * - fan-made: made by fans (drawings, cosplay photos, custom sprites).
 * - unknown: the source does not say (e.g. images imported by hand).
 */
export type ContentOrigin = 'official' | 'fan-made' | 'unknown'

export type ImageFormat = 'jpeg' | 'png' | 'webp'

/** One downloaded and validated image, as stored in data/metadata/sources.json. */
export interface ImageRecord extends ImageCandidate {
    filename: string
    /** Path relative to the repository root, with forward slashes. */
    path: string
    format: ImageFormat
    width: number
    height: number
    bytes: number
    sha256: string
    /** 64-bit difference hash (hex), used to detect resized or re-encoded copies. */
    perceptualHash: string
    /** ISO 8601 */
    downloadedAt: string
}

export const REJECTION_REASONS = [
    // Decided before downloading, from the source's metadata.
    'license-not-allowed',
    'ambiguous-subject',
    'off-topic',
    'content-rating',
    'unsupported-extension',
    // Decided after downloading.
    'download-failed',
    'not-an-image',
    'unsupported-format',
    'too-small',
    'too-large',
    'corrupted',
    'duplicate-exact',
    'duplicate-near',
    'file-exists',
    // Decided by a person looking at the image (wrong character, several subjects, unusable).
    'manual-review',
] as const

export type RejectionReason = (typeof REJECTION_REASONS)[number]

/** Reasons decided before downloading, from the source's metadata and the current planning rules. */
export const PLAN_REJECTIONS: ReadonlySet<RejectionReason> = new Set([
    'license-not-allowed',
    'ambiguous-subject',
    'off-topic',
    'content-rating',
    'unsupported-extension',
])

/** Reasons that may succeed on a later run, so a resumed collection tries those URLs again. */
export const TRANSIENT_REJECTIONS: ReadonlySet<RejectionReason> = new Set(['download-failed', 'file-exists'])

export interface Rejection {
    url: string
    title: string
    sourceName: string
    /** `null` when the image was refused before a label could be decided (e.g. unidentified character). */
    label: ClassLabel | null
    subcategory: string
    reason: RejectionReason
    detail: string
    /** ISO 8601 */
    rejectedAt: string
}
