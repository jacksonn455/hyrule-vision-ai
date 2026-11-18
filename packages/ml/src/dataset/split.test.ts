import { describe, expect, it } from 'vitest'

import { characterClasses } from './classes.ts'
import { stratifiedSplit } from './split.ts'

describe('stratifiedSplit', () => {
    const paths = [
        ...Array.from({ length: 20 }, (_, i) => `link/botw/${i}.jpg`),
        ...Array.from({ length: 20 }, (_, i) => `zelda/tp/${i}.jpg`),
        ...Array.from({ length: 2 }, (_, i) => `ravio/${i}.jpg`),
    ]
    const { images } = characterClasses(paths, 10, new Set(), true)

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
