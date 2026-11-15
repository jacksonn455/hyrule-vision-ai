import { describe, expect, it } from 'vitest'

import { isRawSubcategory, otherCharacterFolder, rawSubcategoryDir } from './taxonomy.ts'

describe('otherCharacterFolder', () => {
    it.each([
        ['Skull Kid (The Legend of Zelda)', 'skull-kid'],
        ['skull kid', 'skull-kid'],
        ['saria_(zelda)', 'saria'],
        ['midna_(true)', 'midna'],
        ['Midna', 'midna'],
        ['Princess Mipha (The Legend of Zelda)', 'mipha'],
        ['Queen Sonia', 'sonia'],
        ['fi_(zelda)', 'fi'],
        ['Sydon', 'sidon'],
    ])('puts "%s" in other/%s', (name, folder) => {
        expect(otherCharacterFolder(name)).toBe(folder)
    })

    it('uses other-characters for characters without a folder, and never a group folder', () => {
        expect(otherCharacterFolder('Resident Evil creatures')).toBe('other-characters')
        expect(otherCharacterFolder('Lana')).toBe('other-characters')
        expect(otherCharacterFolder('enemies')).toBe('other-characters')
    })
})

describe('taxonomy', () => {
    it('validates sub-categories per label', () => {
        expect(isRawSubcategory('other', 'saria')).toBe(true)
        expect(isRawSubcategory('link', 'saria')).toBe(false)
        expect(() => rawSubcategoryDir('link', 'saria')).toThrow(/not a sub-category/)
    })
})
