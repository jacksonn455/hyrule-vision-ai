import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { classifyCrop, gameFromCopyright, planDeepghsCandidates } from './deepghs-character-index.ts'
import type { DeepghsCharacter, DeepghsCropMeta } from './deepghs-character-index.ts'
import { buildStoredZip } from '../test-fixtures.ts'

const zelda: DeepghsCharacter = {
    tag: 'princess_zelda',
    folder: 'e9/princess_zelda',
    label: 'zelda',
    subcategory: 'unspecified',
}

function meta(
    overrides: Partial<DeepghsCropMeta['danbooru']> = {},
    tags: Record<string, number> = {},
): DeepghsCropMeta {
    return {
        danbooru: {
            id: 42,
            rating: 'g',
            source: 'https://www.pixiv.net/artworks/1',
            tag_string_artist: 'some_artist',
            tag_string_copyright: 'the_legend_of_zelda',
            ...overrides,
        },
        url: 'https://cdn.donmai.us/original/aa/bb/x.jpg',
        tags: { '1girl': 0.99, princess_zelda: 0.95, ...tags },
    }
}

describe('classifyCrop', () => {
    it('keeps a single, recognised character and takes the game from the copyright tags', () => {
        expect(
            classifyCrop(
                zelda,
                meta({ tag_string_copyright: 'the_legend_of_zelda the_legend_of_zelda:_twilight_princess' }),
            ),
        ).toEqual({ label: 'zelda', subcategory: 'twilight-princess', game: 'twilight-princess' })
    })

    it('keeps the default sub-category when no or several games are named', () => {
        expect(classifyCrop(zelda, meta())).toMatchObject({ subcategory: 'unspecified' })
        expect(
            classifyCrop(
                zelda,
                meta({
                    tag_string_copyright:
                        'the_legend_of_zelda:_breath_of_the_wild the_legend_of_zelda:_tears_of_the_kingdom',
                }),
            ),
        ).toMatchObject({ subcategory: 'unspecified' })
    })

    it.each(['s', 'q', 'e'])('rejects rating "%s"', (rating) => {
        expect(classifyCrop(zelda, meta({ rating }))).toMatchObject({ rejected: 'content-rating' })
    })

    it('rejects crops where the character is not recognised (another person from the same post)', () => {
        expect(classifyCrop(zelda, meta({}, { princess_zelda: 0.2 }))).toMatchObject({ rejected: 'ambiguous-subject' })
        expect(
            classifyCrop(
                zelda,
                meta({ tag_string_character: 'link princess_zelda' }, { princess_zelda: 0.2, solo: 0.9 }),
            ),
        ).toMatchObject({ rejected: 'ambiguous-subject' })
    })

    it('accepts a solo crop the tagger missed when the post only names this character', () => {
        expect(
            classifyCrop(zelda, meta({ tag_string_character: 'princess_zelda' }, { princess_zelda: 0.2, solo: 0.9 })),
        ).toMatchObject({ label: 'zelda' })
    })

    it('rejects crops showing two characters or several people', () => {
        expect(classifyCrop(zelda, meta({}, { link: 0.9 }))).toMatchObject({ rejected: 'ambiguous-subject' })
        expect(classifyCrop(zelda, meta({}, { sheik: 0.8 }))).toMatchObject({ rejected: 'ambiguous-subject' })
        expect(classifyCrop(zelda, meta({}, { '1boy': 0.9 }))).toMatchObject({ rejected: 'ambiguous-subject' })
        expect(classifyCrop(zelda, meta({}, { multiple_girls: 0.7 }))).toMatchObject({ rejected: 'ambiguous-subject' })
    })

    it('maps copyright tags to games', () => {
        expect(gameFromCopyright("the_legend_of_zelda:_majora's_mask")).toBe('majoras-mask')
        expect(gameFromCopyright('the_legend_of_zelda:_the_wind_waker')).toBe('wind-waker')
        expect(gameFromCopyright(undefined)).toBeUndefined()
    })
})

describe('planDeepghsCandidates', () => {
    let cache: string

    beforeEach(async () => {
        cache = await mkdtemp(path.join(tmpdir(), 'hyrule-deepghs-'))
    })

    afterEach(async () => {
        await rm(cache, { recursive: true, force: true })
    })

    it('downloads the zip once, extracts accepted crops and records real metadata only', async () => {
        const zip = buildStoredZip({
            'danbooru_42_person0.webp': Buffer.from('image-a'),
            '.danbooru_42_person0_meta.json': Buffer.from(JSON.stringify(meta())),
            'danbooru_43_person0.webp': Buffer.from('image-b'),
            '.danbooru_43_person0_meta.json': Buffer.from(JSON.stringify(meta({ id: 43, rating: 'e' }))),
        })
        const download = vi.fn(() => Promise.resolve(zip))

        const plan = await planDeepghsCandidates(cache, download, [zelda])
        await planDeepghsCandidates(cache, download, [zelda])

        expect(download).toHaveBeenCalledTimes(1)
        expect(download).toHaveBeenCalledWith(
            'https://huggingface.co/datasets/deepghs/character_index/resolve/main/e9/princess_zelda/images.zip',
        )
        expect(plan.rejected).toEqual([expect.objectContaining({ reason: 'content-rating' })])
        expect(plan.candidates).toEqual([
            expect.objectContaining({
                label: 'zelda',
                sourcePageUrl: 'https://danbooru.donmai.us/posts/42',
                originalImageUrl: 'https://www.pixiv.net/artworks/1',
                author: 'some_artist',
                contentOrigin: 'fan-made',
                downloadUrl: expect.stringMatching(/^file:.*danbooru_42_person0\.webp$/) as string,
            }),
        ])
    })
})
