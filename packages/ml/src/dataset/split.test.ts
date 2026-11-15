import { describe, expect, it } from 'vitest'

import { labelFromRawPath, stratifiedSplit } from './split.ts'

describe('labelFromRawPath', () => {
    it('maps link/zelda folders to their class and anything else to other', () => {
        expect(labelFromRawPath('link/wind-waker/a.jpg')).toMatchObject({ label: 'link', group: 'link/wind-waker' })
        expect(labelFromRawPath('zelda/a.jpg').label).toBe('zelda')
        expect(labelFromRawPath('midna/a.jpg')).toMatchObject({ label: 'other', group: 'midna' })
        expect(labelFromRawPath('other/midna/a.jpg').label).toBe('other')
    })
})

describe('stratifiedSplit', () => {
    const images = [
        ...Array.from({ length: 20 }, (_, i) => labelFromRawPath(`link/botw/${i}.jpg`)),
        ...Array.from({ length: 20 }, (_, i) => labelFromRawPath(`zelda/tp/${i}.jpg`)),
        ...Array.from({ length: 2 }, (_, i) => labelFromRawPath(`ravio/${i}.jpg`)),
    ]

    it('splits every folder 70/15/15, keeps tiny folders in train, loses nothing', () => {
        const split = stratifiedSplit(images)
        const count = (s: keyof typeof split, label: string) => split[s].filter((x) => x.label === label).length
        expect([count('train', 'link'), count('validation', 'link'), count('test', 'link')]).toEqual([14, 3, 3])
        expect(count('train', 'other')).toBe(2)
        const all = [...split.train, ...split.validation, ...split.test].map((x) => x.relativePath)
        expect(new Set(all).size).toBe(images.length)
    })

    it('is deterministic for a given seed', () => {
        expect(stratifiedSplit(images, 7)).toEqual(stratifiedSplit([...images].reverse(), 7))
    })
})
