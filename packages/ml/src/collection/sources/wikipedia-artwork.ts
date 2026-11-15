import type { ClassLabel } from '@hyrule/shared'

import { hasAllowedExtension } from '../image-validator.ts'
import type { RawSubcategory } from '../taxonomy.ts'
import type { ImageCandidate } from '../types.ts'
import type { CommonsFile } from './wikimedia-commons.ts'

export const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php'
export const WIKIPEDIA_SOURCE_NAME = 'English Wikipedia (official artwork)'

/**
 * Official Nintendo artwork shown in English Wikipedia's character articles (Link, Princess Zelda, Ganon, Midna,
 * Tingle, Navi). Hand-picked: each file shows one character. Left out on purpose: photos of voice actors,
 * "SheikZelda.png" (two forms side by side) and the Walk of Game star plaque.
 */
export const WIKIPEDIA_ARTWORK: readonly { title: string; label: ClassLabel; subcategory: RawSubcategory }[] = [
    { title: 'File:Legend of Zelda NES.PNG', label: 'link', subcategory: 'nes' },
    { title: 'File:Link (Hyrule Historia).png', label: 'link', subcategory: 'unspecified' },
    { title: 'File:Link of the Wild.png', label: 'link', subcategory: 'breath-of-the-wild' },
    { title: 'File:Wakerlink.jpg', label: 'link', subcategory: 'wind-waker' },
    { title: 'File:ZELDA OCARINA OF TIME.jpg', label: 'link', subcategory: 'ocarina-of-time' },
    { title: 'File:Link to the Past Zelda.png', label: 'zelda', subcategory: 'a-link-to-the-past' },
    { title: 'File:Zelda (character).png', label: 'zelda', subcategory: 'unspecified' },
    { title: 'File:TetraZelda.png', label: 'zelda', subcategory: 'wind-waker' },
    { title: 'File:Princess Zelda (The Legend of Zelda Cartoon).jpg', label: 'zelda', subcategory: 'unspecified' },
    { title: 'File:Fc zelda.jpg', label: 'zelda', subcategory: 'unspecified' },
    { title: 'File:Ganon (Oracle of Ages & Oracle of Seasons).png', label: 'other', subcategory: 'ganondorf' },
    { title: 'File:Ganon screenshot 1986.jpg', label: 'other', subcategory: 'ganondorf' },
    { title: 'File:Ganondorf Ocarina of Time.png', label: 'other', subcategory: 'ganondorf' },
    { title: 'File:Ganondorf artwork for Tears of the Kingdom.png', label: 'other', subcategory: 'ganondorf' },
    { title: 'File:Tingle art.png', label: 'other', subcategory: 'tingle' },
    { title: 'File:Midna.png', label: 'other', subcategory: 'midna' },
    { title: 'File:Navi (The Legend of Zelda).png', label: 'other', subcategory: 'creatures' },
]

/** Turns the fetched file metadata into candidates. License and author come from the file page, as they are. */
export function planWikipediaArtwork(files: readonly CommonsFile[]): ImageCandidate[] {
    const byTitle = new Map(files.map((file) => [file.title, file]))
    return WIKIPEDIA_ARTWORK.flatMap(({ title, label, subcategory }) => {
        const file = byTitle.get(title)
        if (!file || !hasAllowedExtension(file.title)) return []
        return [
            {
                url: file.originalUrl,
                sourcePageUrl: file.pageUrl,
                originalImageUrl: file.originalUrl,
                sourceName: WIKIPEDIA_SOURCE_NAME,
                title: file.title,
                label,
                subcategory,
                license: `${file.license} (non-free content © Nintendo, used on Wikipedia under fair use)`,
                licenseUrl: file.licenseUrl,
                author: file.author,
                attribution: file.author
                    ? `${file.author} (via English Wikipedia)`
                    : '© Nintendo (via English Wikipedia)',
                variant: 'original',
                contentOrigin: 'official',
            },
        ]
    })
}
