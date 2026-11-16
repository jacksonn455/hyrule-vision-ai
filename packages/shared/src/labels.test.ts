import { describe, expect, it } from 'vitest'

import { COLLECTION_LABELS, displayName, isCollectionLabel } from './labels.ts'

describe('collection labels', () => {
    it('keeps the collection categories', () => {
        expect(COLLECTION_LABELS).toEqual(['link', 'zelda', 'other'])
        expect(isCollectionLabel('zelda')).toBe(true)
        expect(isCollectionLabel('ganon')).toBe(false)
    })
})

describe('displayName', () => {
    it('title-cases folder names, keeping small words lowercase', () => {
        expect(displayName('skull-kid')).toBe('Skull Kid')
        expect(displayName('ocarina-of-time')).toBe('Ocarina of Time')
        expect(displayName('a-link-to-the-past')).toBe('A Link to the Past')
        expect(displayName('link')).toBe('Link')
    })

    it('handles special names and typos in folder names', () => {
        expect(displayName('nes')).toBe('NES')
        expect(displayName('Links-awekening')).toBe("Link's Awakening")
    })
})
