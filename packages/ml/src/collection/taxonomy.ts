import path from 'node:path'

import type { ClassLabel } from '@hyrule/shared'

import { RAW_DATA_DIR } from '../paths.ts'

/**
 * Sub-folders of data/raw/<label>/. The main label (folder above) is what the CNN learns;
 * the sub-folder only documents where the image comes from, so we can audit coverage
 * (e.g. "no Wind Waker Link yet") and keep a balanced mix of games and styles.
 *
 * `unspecified` holds images whose game cannot be determined reliably from the source metadata.
 * Guessing would silently corrupt the coverage numbers, so we prefer an honest "unknown".
 */
export const RAW_SUBCATEGORIES = {
    link: [
        'nes',
        'a-link-to-the-past',
        'ocarina-of-time',
        'majoras-mask',
        'wind-waker',
        'twilight-princess',
        'skyward-sword',
        'breath-of-the-wild',
        'tears-of-the-kingdom',
        'unspecified',
    ],
    zelda: [
        'nes',
        'a-link-to-the-past',
        'ocarina-of-time',
        'majoras-mask',
        'wind-waker',
        'twilight-princess',
        'skyward-sword',
        'breath-of-the-wild',
        'tears-of-the-kingdom',
        'unspecified',
    ],
    other: [
        'ganondorf',
        // Named characters get their own folder, so coverage and model errors can be analysed per character.
        'midna',
        'skull-kid',
        'mipha',
        'paya',
        'saria',
        'malon',
        'impa',
        'riju',
        'purah',
        'tingle',
        'fi',
        'sonia',
        'ghirahim',
        'urbosa',
        'zant',
        'sidon',
        'ravio',
        'vaati',
        'agitha',
        'horror-kid',
        'revali',
        'daruk',
        'hylia',
        // Groups, and named characters without a folder of their own.
        'enemies',
        'npcs',
        'creatures',
        'objects',
        'other-characters',
    ],
} as const satisfies Record<ClassLabel, readonly string[]>

/** Different names for the same character ("True Midna" is Midna's true form). */
const CHARACTER_ALIASES: Record<string, string> = { sydon: 'sidon', 'midna-true': 'midna' }

/**
 * Folder of a named `other` character: "Skull Kid (The Legend of Zelda)" → "skull-kid", "saria_(zelda)" → "saria",
 * "Princess Mipha" → "mipha". Characters without a folder of their own go to "other-characters".
 */
export function otherCharacterFolder(name: string): RawSubcategory {
    const slug = name
        .toLowerCase()
        .replace(/\((the legend of )?zelda\)/g, '')
        .replace(/\(true\)/g, 'true')
        .replace(/^(princess|queen)\s+/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    const folder = CHARACTER_ALIASES[slug] ?? slug
    return isRawSubcategory('other', folder) && !['enemies', 'npcs', 'creatures', 'objects'].includes(folder)
        ? folder
        : 'other-characters'
}

export type RawSubcategory = (typeof RAW_SUBCATEGORIES)[ClassLabel][number]

export function isRawSubcategory(label: ClassLabel, subcategory: string): subcategory is RawSubcategory {
    return (RAW_SUBCATEGORIES[label] as readonly string[]).includes(subcategory)
}

/** e.g. data/raw/link/wind-waker */
export function rawSubcategoryDir(label: ClassLabel, subcategory: RawSubcategory, rawDir = RAW_DATA_DIR): string {
    if (!isRawSubcategory(label, subcategory)) {
        throw new Error(`"${String(subcategory)}" is not a sub-category of "${label}"`)
    }
    return path.join(rawDir, label, subcategory)
}
