import { describe, expect, it } from 'vitest'

import { diversify } from './diversify.ts'

describe('diversify', () => {
    it('round-robins across groups, keeping the order inside each group', () => {
        const items = ['a1', 'a2', 'a3', 'b1', 'c1', 'c2']

        expect(diversify(items, [(item) => item[0]!])).toEqual(['a1', 'b1', 'c1', 'a2', 'c2', 'a3'])
    })

    it('applies keys recursively (source, then author)', () => {
        const items = [
            { source: 'commons', author: 'x', id: 1 },
            { source: 'commons', author: 'x', id: 2 },
            { source: 'commons', author: 'y', id: 3 },
            { source: 'hf', author: 'z', id: 4 },
            { source: 'hf', author: 'z', id: 5 },
        ]

        const ordered = diversify(items, [(i) => i.source, (i) => i.author]).map((i) => i.id)

        expect(ordered).toEqual([1, 4, 3, 5, 2])
    })

    it('returns a copy when there are no keys', () => {
        const items = [1, 2, 3]

        expect(diversify(items, [])).toEqual(items)
        expect(diversify(items, [])).not.toBe(items)
    })
})
