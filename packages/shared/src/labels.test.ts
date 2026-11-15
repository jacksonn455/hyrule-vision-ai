import { describe, expect, it } from 'vitest'

import { CLASS_DISPLAY_NAMES, CLASS_LABELS, isClassLabel } from './labels.ts'

describe('class labels', () => {
    it('keeps the output-layer order stable', () => {
        expect(CLASS_LABELS).toEqual(['link', 'zelda', 'other'])
    })

    it('has a display name for every label', () => {
        expect(Object.keys(CLASS_DISPLAY_NAMES).sort()).toEqual([...CLASS_LABELS].sort())
    })

    it('recognises valid labels only', () => {
        expect(isClassLabel('zelda')).toBe(true)
        expect(isClassLabel('ganon')).toBe(false)
    })
})
