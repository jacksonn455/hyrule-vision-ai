import { describe, expect, it } from 'vitest'

import { classifyBotwCaption, planBotwCandidates } from './botw-screenshots-plan.ts'

const PREFIX = 'cinematic screenshot from The Legend of Zelda: Breath of the Wild, '

describe('classifyBotwCaption', () => {
    it.each([
        [
            '(close-up portrait of Link:1.2) wearing the Guardian armor',
            { label: 'link', subcategory: 'breath-of-the-wild' },
        ],
        [
            '(view from behind of Link:1.2) riding Epona across a valley',
            { label: 'link', subcategory: 'breath-of-the-wild' },
        ],
        [
            'ghostly apparition of Zelda, floating in a misty forest',
            { label: 'zelda', subcategory: 'breath-of-the-wild' },
        ],
        ['close-up shot of Sydon, the Zora prince', { label: 'other', subcategory: 'sidon' }],
        ['Robbie in his lab', { label: 'other', subcategory: 'other-characters' }],
        ['a massive Lynel charging', { label: 'other', subcategory: 'enemies' }],
        ['Calamity Ganon swirling around Hyrule Castle', { label: 'other', subcategory: 'ganondorf' }],
        ['a Korok hiding under a leaf', { label: 'other', subcategory: 'creatures' }],
    ] as const)('labels "%s"', (caption, expected) => {
        expect(classifyBotwCaption(PREFIX + caption)).toEqual(expected)
    })

    it.each([
        ['Link and Zelda sitting together on a throne', 'ambiguous-subject'],
        ['close-up of Impa and Link', 'ambiguous-subject'],
        ['(close up of Zelda):1.3, Gerudo champion', 'ambiguous-subject'],
        ['inventory screen, item display of Mighty Bananas', 'off-topic'],
        ['showing a text box with a dialogue bubble', 'off-topic'],
        ['inside a Sheikah Shrine, glowing blue patterns', 'off-topic'],
    ])('rejects "%s"', (caption, reason) => {
        expect(classifyBotwCaption(PREFIX + caption)).toMatchObject({ rejected: reason })
    })

    it('ignores "The Legend of Zelda" in the game title', () => {
        expect(classifyBotwCaption('screenshot from The Legend of Zelda: Breath of the Wild, Link climbing')).toEqual({
            label: 'link',
            subcategory: 'breath-of-the-wild',
        })
    })
})

describe('planBotwCandidates', () => {
    it('uses a stable row URL as identity and the signed image URL only to download', () => {
        const { candidates, rejected } = planBotwCandidates([
            {
                rowIndex: 7,
                imageUrl: 'https://signed/7.jpg?Expires=1',
                width: 1280,
                height: 720,
                text: PREFIX + 'Link in a cell',
            },
            { rowIndex: 8, imageUrl: 'https://signed/8.jpg?Expires=1', width: 1280, height: 720, text: 'map screen' },
        ])

        expect(candidates).toEqual([
            expect.objectContaining({
                url: 'https://huggingface.co/datasets/XeIaso/botw-screenshots-captioned/viewer/default/train?row=7',
                downloadUrl: 'https://signed/7.jpg?Expires=1',
                label: 'link',
                subcategory: 'breath-of-the-wild',
                title: 'botw-screenshot-0007',
            }),
        ])
        expect(rejected).toEqual([expect.objectContaining({ reason: 'off-topic', title: 'botw-screenshot-0008' })])
    })
})
