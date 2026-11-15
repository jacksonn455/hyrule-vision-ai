import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
    isGenericFilename,
    listInbox,
    manualCandidate,
    parseZoneIdentifier,
    readEmbeddedCredits,
    toLocalPath,
} from './manual-import.ts'
import { blockImage } from './test-fixtures.ts'

describe('isGenericFilename', () => {
    it.each(['images (3).jpeg', 'download.jpg', 'unnamed.png', 'img.jpg', '1234567890.webp', 'a1b2c3d4e5f6a7b8.png'])(
        'treats "%s" as generic',
        (name) => {
            expect(isGenericFilename(name)).toBe(true)
        },
    )

    it.each(['zelda-twilight-princess.png', 'Link BOTW artwork.jpg', 'ganondorf_oot.webp'])('keeps "%s"', (name) => {
        expect(isGenericFilename(name)).toBe(false)
    })
})

describe('source hints', () => {
    it('reads HostUrl and ReferrerUrl from a Zone.Identifier stream, ignoring non-web URLs', () => {
        expect(
            parseZoneIdentifier(
                '[ZoneTransfer]\r\nZoneId=3\r\nReferrerUrl=https://example.org/page\r\nHostUrl=https://cdn.example.org/a.png\r\n',
            ),
        ).toEqual({ referrerUrl: 'https://example.org/page', hostUrl: 'https://cdn.example.org/a.png' })
        expect(parseZoneIdentifier('[ZoneTransfer]\nZoneId=3\nHostUrl=about:internet\n')).toEqual({
            hostUrl: undefined,
            referrerUrl: undefined,
        })
    })

    it('reads creator and rights embedded as XMP, and nothing when absent', async () => {
        const xmp =
            '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
            '<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/">' +
            '<dc:creator><rdf:Seq><rdf:li>Jane Artist</rdf:li></rdf:Seq></dc:creator>' +
            '<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">CC BY 4.0</rdf:li></rdf:Alt></dc:rights>' +
            '</rdf:Description></rdf:RDF></x:xmpmeta>'
        const withXmp = await sharp(await blockImage(1))
            .withXmp(xmp)
            .png()
            .toBuffer()

        expect(await readEmbeddedCredits(withXmp)).toEqual({ creator: 'Jane Artist', rights: 'CC BY 4.0' })
        expect(await readEmbeddedCredits(await blockImage(1))).toEqual({ creator: undefined, rights: undefined })
    })
})

describe('manualCandidate', () => {
    const base = {
        file: '/data/inbox/zelda/twilight-princess/images (2).jpg',
        label: 'zelda' as const,
        subcategory: 'twilight-princess' as const,
        originalFilename: 'images (2).jpg',
        sha256: 'ab'.repeat(32),
    }

    it('never invents a source, author or license', () => {
        expect(manualCandidate(base)).toMatchObject({
            url: `manual:sha256:${'ab'.repeat(32)}`,
            sourcePageUrl: undefined,
            originalImageUrl: undefined,
            author: undefined,
            attribution: null,
            license: 'Unknown (imported by hand; private study only)',
            contentOrigin: 'unknown',
            title: 'manual-import',
            originalFilename: 'images (2).jpg',
        })
    })

    it('keeps a useful original name and records the facts that are known', () => {
        const candidate = manualCandidate({
            ...base,
            originalFilename: 'zelda-tp-artwork.png',
            hints: { hostUrl: 'https://cdn.example.org/z.png', referrerUrl: 'https://example.org/z', creator: 'Jane' },
        })

        expect(candidate).toMatchObject({
            title: 'zelda-tp-artwork',
            originalImageUrl: 'https://cdn.example.org/z.png',
            sourcePageUrl: 'https://example.org/z',
            author: 'Jane',
            attribution: 'Jane',
        })
    })
})

describe('listInbox', () => {
    let inbox: string

    async function put(relative: string) {
        const file = path.join(inbox, relative)
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, 'x')
    }

    beforeEach(async () => {
        inbox = await mkdtemp(path.join(tmpdir(), 'hyrule-inbox-'))
    })

    afterEach(async () => {
        await rm(inbox, { recursive: true, force: true })
    })

    it('takes the label and sub-category from the folders, including sprite sheets', async () => {
        await put('zelda/twilight-princess/z.png')
        await put('sprite-sheets/link/nes/sheet.png')
        await put('zelda/twilight-princess/.gitkeep')
        await put('_rejected/too-small/x.png')

        const { files, misplaced } = await listInbox(inbox)

        expect(misplaced).toEqual([])
        expect(files.map((f) => [f.label, f.subcategory, f.isSpriteSheet])).toEqual([
            ['link', 'nes', true],
            ['zelda', 'twilight-princess', false],
        ])
    })

    it('reports files it cannot place instead of guessing', async () => {
        await put('loose.png')
        await put('link/not-a-game/x.png')
        await put('ganon/ganondorf/x.png')
        await put('link/nes/notes.txt')

        expect((await listInbox(inbox)).misplaced).toHaveLength(4)
    })
})

describe('toLocalPath', () => {
    it('converts pasted Windows paths for WSL and strips quotes', () => {
        const expected = process.platform === 'win32' ? 'C:\\Users\\me\\a b.png' : '/mnt/c/Users/me/a b.png'
        expect(toLocalPath('"C:\\Users\\me\\a b.png"')).toBe(expected)
        expect(toLocalPath('/home/me/x.png')).toBe('/home/me/x.png')
    })
})
