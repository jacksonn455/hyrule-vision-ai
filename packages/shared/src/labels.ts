/**
 * Top-level categories used by the COLLECTION pipeline (data/inbox, metadata, reports): Link, Zelda and
 * everything else. These are NOT the model classes any more: the models discover their classes from the folders
 * in data/raw (see packages/ml/src/dataset/classes.ts), so adding a character never requires a code change.
 */
export const COLLECTION_LABELS = ['link', 'zelda', 'other'] as const

export type CollectionLabel = (typeof COLLECTION_LABELS)[number]

export function isCollectionLabel(value: string): value is CollectionLabel {
    return (COLLECTION_LABELS as readonly string[]).includes(value)
}

/** The class used for "none of the trained characters". Always the last output of the character model. */
export const OTHER_LABEL = 'other'

/** Names that plain title-casing gets wrong. */
const SPECIAL_NAMES: Record<string, string> = {
    nes: 'NES',
    other: 'Other',
    'legend-of-zelda-1': 'The Legend of Zelda (NES)',
    'legend-of-zelda-2': 'Zelda II',
    'links-awekening': "Link's Awakening",
    'links-awakening': "Link's Awakening",
    'four-swourds': 'Four Swords',
    'tri-force-heroes': 'Tri Force Heroes',
}
const SMALL_WORDS = new Set(['a', 'an', 'and', 'of', 'the', 'to', 'in', 'on', 'for'])

/**
 * Folder name → human name: "skull-kid" → "Skull Kid", "ocarina-of-time" → "Ocarina of Time".
 * Works for any folder, so a new character or game folder is displayed nicely without code changes.
 */
export function displayName(label: string): string {
    const key = label.toLowerCase()
    if (SPECIAL_NAMES[key]) return SPECIAL_NAMES[key]
    return key
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((word, i) => (i > 0 && SMALL_WORDS.has(word) ? word : word[0]!.toUpperCase() + word.slice(1)))
        .join(' ')
}
