import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MetadataStore } from './metadata-store.ts'
import { candidate } from './test-fixtures.ts'
import type { ImageRecord, Rejection } from './types.ts'

function record(url: string): ImageRecord {
    return {
        ...candidate({ url }),
        filename: 'link-wind-waker-link-cosplay-12345678.png',
        path: 'data/raw/link/wind-waker/link-wind-waker-link-cosplay-12345678.png',
        format: 'png',
        width: 256,
        height: 256,
        bytes: 1000,
        sha256: '12345678'.padEnd(64, '0'),
        perceptualHash: '0123456789abcdef',
        downloadedAt: '2026-10-29T12:00:00.000Z',
    }
}

function rejection(url: string, reason: Rejection['reason']): Rejection {
    return {
        url,
        title: 't',
        sourceName: 's',
        label: 'zelda',
        subcategory: 'unspecified',
        reason,
        detail: '',
        rejectedAt: '2026-10-29T12:00:00.000Z',
    }
}

describe('MetadataStore', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'hyrule-metadata-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('starts empty when no metadata exists yet', async () => {
        const store = await MetadataStore.load(dir)

        expect(store.allImages()).toEqual([])
        expect(store.allRejections()).toEqual([])
    })

    it('persists images and rejections and reloads them (resumable runs)', async () => {
        const store = await MetadataStore.load(dir)
        store.addImage(record('https://a/1.png'))
        store.addRejection(rejection('https://a/2.png', 'corrupted'))
        await store.save()

        const reloaded = await MetadataStore.load(dir)

        expect(reloaded.allImages()).toEqual([record('https://a/1.png')])
        expect(reloaded.hasImage('https://a/1.png')).toBe(true)
        expect(reloaded.isPermanentlyRejected('https://a/2.png')).toBe(true)
        expect(reloaded.countByLabel('link')).toBe(1)
    })

    it('writes every field required for auditing to sources.json', async () => {
        const store = await MetadataStore.load(dir)
        store.addImage(record('https://a/1.png'))
        await store.save()

        const json = JSON.parse(await readFile(path.join(dir, 'sources.json'), 'utf8')) as { images: ImageRecord[] }

        expect(json.images[0]).toMatchObject({
            filename: expect.any(String) as string,
            label: 'link',
            subcategory: 'wind-waker',
            url: 'https://a/1.png',
            sourcePageUrl: expect.any(String) as string,
            sourceName: 'Test source',
            license: 'CC BY-SA 4.0',
            attribution: 'Jane Doe, CC BY-SA 4.0',
            downloadedAt: '2026-10-29T12:00:00.000Z',
            sha256: expect.stringMatching(/^[0-9a-f]{64}$/) as string,
        })
    })

    it('treats network failures as retryable on the next run', async () => {
        const store = await MetadataStore.load(dir)
        store.addRejection(rejection('https://a/3.png', 'download-failed'))

        expect(store.isPermanentlyRejected('https://a/3.png')).toBe(false)
    })

    it('moves an image rejected in review to the rejections, so it is never downloaded again', async () => {
        const store = await MetadataStore.load(dir)
        const image = record('https://a/6.png')
        store.addImage(image)

        expect(store.rejectImage(image.path, 'manual-review', 'shows two characters')?.url).toBe('https://a/6.png')
        expect(store.hasImage('https://a/6.png')).toBe(false)
        expect(store.isPermanentlyRejected('https://a/6.png')).toBe(true)
        expect(store.rejectImage('missing.png', 'manual-review', '')).toBeUndefined()
    })

    it('forgets planning rejections, never review or content rejections', async () => {
        const store = await MetadataStore.load(dir)
        store.addRejection(rejection('https://a/7.png', 'ambiguous-subject'))
        store.addRejection(rejection('https://a/8.png', 'manual-review'))

        store.forgetPlanRejection('https://a/7.png')
        store.forgetPlanRejection('https://a/8.png')

        expect(store.allRejections().map((r) => r.url)).toEqual(['https://a/8.png'])
    })

    it('keeps only the latest outcome per URL', async () => {
        const store = await MetadataStore.load(dir)
        store.addRejection(rejection('https://a/4.png', 'download-failed'))
        store.addRejection(rejection('https://a/4.png', 'corrupted'))
        store.addImage(record('https://a/5.png'))
        store.addRejection(rejection('https://a/5.png', 'download-failed'))
        store.addImage(record('https://a/5b.png'))

        expect(store.allRejections().map((r) => [r.url, r.reason])).toEqual([
            ['https://a/4.png', 'corrupted'],
            ['https://a/5.png', 'download-failed'],
        ])
    })
})
