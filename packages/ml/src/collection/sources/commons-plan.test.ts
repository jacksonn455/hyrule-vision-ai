import { describe, expect, it } from 'vitest'

import {
    assignCharacter,
    cosplayCharacter,
    inferGame,
    isAllowedCommonsLicense,
    planCommonsFile,
} from './commons-plan.ts'
import type { CommonsFile } from './wikimedia-commons.ts'

function file(overrides: Partial<CommonsFile> = {}): CommonsFile {
    return {
        title: 'File:Fanime 2023 cosplay.jpg',
        pageUrl: 'https://commons.wikimedia.org/wiki/File:Fanime_2023_cosplay.jpg',
        originalUrl: 'https://upload.wikimedia.org/a/ab/Fanime_2023_cosplay.jpg',
        scaledUrl: 'https://upload.wikimedia.org/thumb/a/ab/Fanime_2023_cosplay.jpg/1920px-Fanime_2023_cosplay.jpg',
        mime: 'image/jpeg',
        width: 3000,
        height: 2000,
        bytes: 2_000_000,
        categories: ['Category:Cosplay of Link'],
        license: 'CC BY-SA 2.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0',
        author: 'Jane Doe',
        attributionRequired: true,
        description: '',
        ...overrides,
    }
}

describe('Commons category organisation', () => {
    it('extracts the character from cosplay categories', () => {
        expect(cosplayCharacter('Category:Cosplay of Link')).toBe('link')
        expect(cosplayCharacter('Category:Cosplay of Skull Kid (The Legend of Zelda)')).toBe('skull kid')
        expect(cosplayCharacter('Category:Cosplay of female The Legend of Zelda characters')).toBeUndefined()
        expect(cosplayCharacter('Category:Unidentified cosplay of The Legend of Zelda')).toBeUndefined()
        expect(cosplayCharacter('Category:Fanime 2023')).toBeUndefined()
        expect(cosplayCharacter('Category:Cosplay of Princess Zelda at Riminicomix 2021')).toBe('princess zelda')
        expect(cosplayCharacter('Category:Cosplay of Mario in Canada')).toBe('mario')
        expect(cosplayCharacter('Category:Cosplay of video games at Comic-Con International')).toBeUndefined()
    })

    it.each([
        ['link', { label: 'link', subcategory: 'unspecified' }],
        ['link in the gerudo outfit', { label: 'link', subcategory: 'breath-of-the-wild' }],
        ['princess zelda', { label: 'zelda', subcategory: 'unspecified' }],
        ['tetra', { label: 'zelda', subcategory: 'wind-waker' }],
        ['ganondorf', { label: 'other', subcategory: 'ganondorf' }],
        ['bokoblin', { label: 'other', subcategory: 'enemies' }],
        ['korok', { label: 'other', subcategory: 'creatures' }],
        ['malon', { label: 'other', subcategory: 'malon' }],
        ['beedle', { label: 'other', subcategory: 'npcs' }],
        ['skull kid', { label: 'other', subcategory: 'skull-kid' }],
        ['midna', { label: 'other', subcategory: 'midna' }],
        ['lana', { label: 'other', subcategory: 'other-characters' }],
        ['dark link', 'exclude'],
        ['sheik', 'exclude'],
        ['link and princess zelda', 'exclude'],
    ] as const)('maps %s', (character, expected) => {
        expect(assignCharacter(character)).toEqual(expected)
    })

    it('infers the game only when exactly one is named', () => {
        expect(inferGame(file({ description: 'Link from Breath of the Wild at Fanime' }))).toBe('breath-of-the-wild')
        expect(inferGame(file({ title: 'File:Twilight Princess Link.jpg' }))).toBe('twilight-princess')
        expect(inferGame(file({ description: 'Ocarina of Time and Majora’s Mask cosplay' }))).toBeUndefined()
        expect(inferGame(file())).toBeUndefined()
        expect(inferGame(file({ title: 'File:Princess Zelda III.jpg' }))).toBeUndefined()
        expect(inferGame(file({ title: 'File:Zelda II cosplay.jpg' }))).toBe('nes')
    })

    it('accepts free licenses only', () => {
        for (const license of ['CC BY-SA 4.0', 'CC BY 2.0', 'CC0', 'Public domain', 'cc-by-sa-3.0']) {
            expect(isAllowedCommonsLicense(license)).toBe(true)
        }
        for (const license of ['Fair use', 'unknown', 'CC BY-NC 2.0', 'All rights reserved']) {
            expect(isAllowedCommonsLicense(license)).toBe(false)
        }
    })
})

describe('planCommonsFile', () => {
    it('turns a single-character cosplay photo into a candidate with license and attribution', () => {
        const decision = planCommonsFile(file({ description: 'Link (Wind Waker) cosplay' }))

        expect(decision).toEqual({
            candidate: {
                url: 'https://upload.wikimedia.org/a/ab/Fanime_2023_cosplay.jpg',
                sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Fanime_2023_cosplay.jpg',
                originalImageUrl: 'https://upload.wikimedia.org/a/ab/Fanime_2023_cosplay.jpg',
                sourceName: 'Wikimedia Commons',
                title: 'File:Fanime 2023 cosplay.jpg',
                label: 'link',
                subcategory: 'wind-waker',
                license: 'CC BY-SA 2.0',
                licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0',
                author: 'Jane Doe',
                attribution: 'Jane Doe, CC BY-SA 2.0, via Wikimedia Commons',
                variant: 'original',
                contentOrigin: 'fan-made',
            },
        })
    })

    it('rejects photos showing several characters', () => {
        const decision = planCommonsFile(
            file({ categories: ['Category:Cosplay of Link', 'Category:Cosplay of Princess Zelda'] }),
        )

        expect(decision).toMatchObject({ rejected: 'ambiguous-subject' })
    })

    it('rejects group photos', () => {
        for (const category of [
            'Category:3 cosplayers',
            'Category:1 female cosplayer, 1 male cosplayer',
            'Category:Group photographs of cosplayers',
        ]) {
            expect(planCommonsFile(file({ categories: ['Category:Cosplay of Link', category] }))).toMatchObject({
                rejected: 'ambiguous-subject',
            })
        }
        expect(
            planCommonsFile(file({ categories: ['Category:Cosplay of Link', 'Category:1 female cosplayer'] })),
        ).toHaveProperty('candidate')
    })

    it('rejects unidentified cosplay, non-free licenses and non-image files', () => {
        expect(
            planCommonsFile(file({ categories: ['Category:Unidentified cosplay of The Legend of Zelda'] })),
        ).toMatchObject({
            rejected: 'ambiguous-subject',
        })
        expect(planCommonsFile(file({ license: 'Fair use' }))).toMatchObject({ rejected: 'license-not-allowed' })
        expect(planCommonsFile(file({ title: 'File:Clip.webm', mime: 'video/webm' }))).toMatchObject({
            rejected: 'unsupported-extension',
        })
    })

    it('files objects without a character under other/objects', () => {
        expect(planCommonsFile(file({ categories: ['Category:Master Sword replicas'] }))).toMatchObject({
            candidate: { label: 'other', subcategory: 'objects' },
        })
    })

    it('uses the 1920 px rendition for very heavy originals', () => {
        expect(planCommonsFile(file({ bytes: 20_000_000 }))).toMatchObject({
            candidate: { url: expect.stringContaining('1920px') as string, variant: 'rendition' },
        })
    })
})
