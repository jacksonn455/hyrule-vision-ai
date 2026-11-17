import { describe, expect, it } from 'vitest'

import { characterClasses, gameClasses } from './classes.ts'

const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}/${i}.jpg`)

describe('characterClasses', () => {
    const paths = [
        ...many('link/wind-waker', 8),
        ...many('link/unspecified', 7),
        ...many('zelda/ocarina-of-time', 12),
        ...many('midna', 10),
        ...many('ravio', 2),
        ...many('objects', 3),
    ]

    it('turns every character folder with enough images into a class, most images first, other last', () => {
        const { classes } = characterClasses(paths, 10)
        expect(classes.labels).toEqual(['link', 'zelda', 'midna', 'other'])
        expect(classes.counts).toEqual({ link: 15, zelda: 12, midna: 10, other: 5 })
        expect(classes.belowThreshold).toEqual({ ravio: 2 })
    })

    it('merges small characters and non-character folders into other', () => {
        const { images } = characterClasses(paths, 10)
        expect(images.find((i) => i.relativePath === 'ravio/0.jpg')).toMatchObject({ label: 'other', group: 'ravio' })
        expect(images.find((i) => i.relativePath === 'link/wind-waker/0.jpg')).toMatchObject({
            label: 'link',
            group: 'link/wind-waker',
        })
    })

    it('also reads characters the collector filed under other/<character>/', () => {
        const { classes } = characterClasses([...paths, ...many('other/midna', 5), ...many('other/enemies', 2)], 10)
        expect(classes.counts.midna).toBe(15)
        expect(classes.counts.other).toBe(7)
    })

    it('raising the threshold demotes a character to other', () => {
        expect(characterClasses(paths, 11).classes.labels).toEqual(['link', 'zelda', 'other'])
    })
})

describe('gameClasses', () => {
    it('pools characters by game and skips unspecified and rare games', () => {
        const paths = [
            ...many('link/wind-waker', 6),
            ...many('zelda/wind-waker', 6),
            ...many('zelda/ocarina-of-time', 10),
            ...many('link/unspecified', 50),
            ...many('link/nes', 3),
            ...many('midna', 30),
            ...many('other/midna', 30),
        ]
        const { images, classes } = gameClasses(paths, 10)
        expect(classes.labels).toEqual(['wind-waker', 'ocarina-of-time'])
        expect(classes.belowThreshold).toEqual({ nes: 3 })
        expect(classes.characters).toEqual(['link', 'zelda'])
        expect(images).toHaveLength(22)
        expect(images[0]).toMatchObject({ label: 'wind-waker', group: 'link/wind-waker' })
    })
})
