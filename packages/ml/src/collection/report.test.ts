import { describe, expect, it } from 'vitest'

import { buildCollectionReport } from './report.ts'
import { candidate } from './test-fixtures.ts'
import type { ImageRecord, Rejection } from './types.ts'

function image(label: ImageRecord['label'], subcategory: ImageRecord['subcategory'], n: number): ImageRecord {
    return {
        ...candidate({ url: `https://x/${label}-${n}.png`, label, subcategory }),
        filename: `${label}-${n}.png`,
        path: `data/raw/${label}/${subcategory}/${label}-${n}.png`,
        format: 'png',
        width: 256,
        height: 256,
        bytes: 1,
        sha256: String(n).padStart(64, '0'),
        perceptualHash: '0'.repeat(16),
        downloadedAt: '2026-10-29T00:00:00.000Z',
    }
}

function rejection(reason: Rejection['reason']): Rejection {
    return { url: 'u', title: 't', sourceName: 's', label: null, subcategory: '', reason, detail: '', rejectedAt: '' }
}

describe('buildCollectionReport', () => {
    const report = buildCollectionReport({
        images: [image('link', 'wind-waker', 1), image('link', 'wind-waker', 2), image('zelda', 'unspecified', 3)],
        rejections: [rejection('duplicate-near'), rejection('duplicate-exact'), rejection('corrupted')],
        sources: [{ name: 'Src', url: 'https://src', status: 'used', license: 'CC0', findings: 'ok' }],
        unaudited: ['data/raw/link/link-01.webp'],
        generatedAt: new Date('2026-10-29T12:00:00Z'),
    })

    it('counts images per category and per sub-category', () => {
        expect(report).toContain('**3 images**')
        expect(report).toContain('| link | 2 |')
        expect(report).toContain('| link | wind-waker | 2 |')
        expect(report).toContain('| other | ganondorf | 0 |')
    })

    it('reports rejections and duplicates', () => {
        expect(report).toContain('3 images rejected')
        expect(report).toContain('2 duplicates skipped (1 byte-identical by SHA-256, 1 visually identical')
    })

    it('flags coverage gaps and images without provenance', () => {
        expect(report).toContain('**other** has 0 images')
        expect(report).toContain('`data/raw/link/link-01.webp`')
    })

    it('lists the investigated sources', () => {
        expect(report).toContain('| [Src](https://src) | used | CC0 | ok |')
    })
})
