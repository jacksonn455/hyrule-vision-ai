import { hasAllowedExtension } from '../image-validator.ts'
import { isRawSubcategory, otherCharacterFolder } from '../taxonomy.ts'
import type { RawSubcategory } from '../taxonomy.ts'
import type { ImageCandidate, RejectionReason } from '../types.ts'
import type { CatalogRoot } from './commons-catalog.ts'
import type { CommonsFile } from './wikimedia-commons.ts'
import { COMMONS_SOURCE_NAME } from './wikimedia-commons.ts'

/**
 * Commons categories we read. Fan art categories are deliberately absent: fan drawings of Nintendo characters
 * are derivative works whose free license is doubtful, and Commons regularly deletes them for that reason.
 */
export const COMMONS_CATALOG_ROOTS: readonly CatalogRoot[] = [
    { category: 'Category:Cosplay of The Legend of Zelda', depth: 2 },
    { category: 'Category:Objects from The Legend of Zelda', depth: 1 },
]

type Assignment = { label: ImageCandidate['label']; subcategory: RawSubcategory } | 'exclude'

/**
 * Character in a "Cosplay of <character>" category → where it goes. Matched against the lower-cased character
 * name; the first matching rule wins.
 *
 * Excluded on purpose: Dark Link and Princess Hilda (look exactly like Link and Zelda but are not them), Sheik
 * (Zelda in disguise, looks nothing like her: too confusing for a first model), and categories naming two characters.
 */
const CHARACTER_RULES: readonly [RegExp, Assignment][] = [
    [/ and /, 'exclude'],
    [/dark link|sheik|hilda/, 'exclude'],
    [/^link in the gerudo outfit$/, { label: 'link', subcategory: 'breath-of-the-wild' }],
    [/^toon link$/, { label: 'link', subcategory: 'wind-waker' }],
    [/^link\b/, { label: 'link', subcategory: 'unspecified' }],
    [/^tetra\b/, { label: 'zelda', subcategory: 'wind-waker' }],
    [/^princess zelda\b|^zelda\b/, { label: 'zelda', subcategory: 'unspecified' }],
    [/ganondorf|^ganon\b/, { label: 'other', subcategory: 'ganondorf' }],
    [
        /bokoblin|moblin|lynel|darknut|redead|lizalfos|stalfos|guardian|yiga|wizzrobe|keaton|octorok/,
        { label: 'other', subcategory: 'enemies' },
    ],
    [/korok|epona|cucco|navi\b|fairy|deku|great fairy|kokiri forest/, { label: 'other', subcategory: 'creatures' }],
    [
        /beedle|happy mask|salesman|hylian|gerudo|goron|zora|rito|kass|hestu|postman|mayor|anju|kafei|ilia/,
        { label: 'other', subcategory: 'npcs' },
    ],
    // Every other named Zelda character (Ghirahim, Midna, Zant, Skull Kid, Sidon, Tingle...): see assignCharacter.
]

const GAMES: readonly [RawSubcategory, RegExp][] = [
    ['tears-of-the-kingdom', /tears of the kingdom|\btotk\b/],
    ['breath-of-the-wild', /breath of the wild|\bbotw\b|champion'?s tunic|climbing gear|sheikah slate|gerudo outfit/],
    ['skyward-sword', /skyward sword/],
    ['twilight-princess', /twilight princess/],
    ['wind-waker', /wind waker|toon link|\btetra\b/],
    ['majoras-mask', /majora/],
    ['ocarina-of-time', /ocarina of time|\boot\b/],
    ['a-link-to-the-past', /link to the past|\balttp\b/],
    ['nes', /\bnes\b|zelda ii\b|adventure of link|8-bit/],
]

/** Free licenses only. Commons does not host NC/ND files, and anything else (e.g. "fair use") is refused. */
const ALLOWED_LICENSE = /^(cc0|public domain|pd\b|cc[ -]by(-sa)?[ -]\d|cc[ -]by(-sa)?$|attribution|gfdl)/i

export function isAllowedCommonsLicense(license: string): boolean {
    return ALLOWED_LICENSE.test(license.trim())
}

const COSPLAY_PREFIX = /^Category:Cosplay of (?:the )?(.+?)(?: \(The Legend of Zelda\))?$/i

/** Qualifiers that narrow a category without naming another character: "... at Riminicomix 2021", "... in Canada". */
const CATEGORY_QUALIFIER = /\s+(at|in|giving|wearing|with)\s.*$/

/**
 * "Category:Cosplay of Skull Kid (The Legend of Zelda)" → "skull kid"
 * "Category:Cosplay of Princess Zelda at Riminicomix 2021" → "princess zelda"
 */
export function cosplayCharacter(category: string): string | undefined {
    const match = COSPLAY_PREFIX.exec(category)
    const name = match?.[1]?.toLowerCase().replace(CATEGORY_QUALIFIER, '').trim()
    if (!name || /legend of zelda|unidentified|female|male|video games|comics characters/.test(name)) return undefined
    return name
}

export function assignCharacter(character: string): Assignment {
    for (const [pattern, assignment] of CHARACTER_RULES) if (pattern.test(character)) return assignment
    return { label: 'other', subcategory: otherCharacterFolder(character) }
}

/** Game named in the title/description/categories, or `undefined` when none or several are named. */
export function inferGame(file: Pick<CommonsFile, 'title' | 'description' | 'categories'>): RawSubcategory | undefined {
    const text = [file.title, file.description, ...file.categories].join(' ').toLowerCase()
    const games = GAMES.filter(([, pattern]) => pattern.test(text)).map(([game]) => game)
    return games.length === 1 ? games[0] : undefined
}

export type CommonsDecision =
    | { candidate: ImageCandidate }
    | { rejected: RejectionReason; detail: string; label?: ImageCandidate['label']; subcategory?: string }

/** Prefer the original file; fall back to Commons' 1920 px rendition for very heavy originals. */
export const MAX_ORIGINAL_BYTES = 6 * 1024 * 1024
export const MAX_ORIGINAL_PIXELS = 24_000_000

/** Cosplay photos without a named character (event galleries, "Unidentified cosplay..."): subject unknown. */
const UNIDENTIFIED_COSPLAY = /cosplay|^Category:AN\d\d /i

/** Commons counts people in cosplay photos ("3 cosplayers", "1 female cosplayer, 1 male cosplayer"). */
const SEVERAL_PEOPLE = /group photographs|^Category:([2-9]|\d\d) cosplayers|cosplayers?, \d/i

export function planCommonsFile(file: CommonsFile): CommonsDecision {
    if (!hasAllowedExtension(file.title)) return { rejected: 'unsupported-extension', detail: file.mime }
    if (!isAllowedCommonsLicense(file.license)) return { rejected: 'license-not-allowed', detail: file.license }

    const characters = [...new Set(file.categories.map(cosplayCharacter).filter((c): c is string => !!c))]
    const assignments = characters.map(assignCharacter)

    let assignment: Assignment
    if (file.categories.some((category) => SEVERAL_PEOPLE.test(category))) {
        return { rejected: 'ambiguous-subject', detail: 'several people in the photo' }
    } else if (characters.length > 1) {
        return { rejected: 'ambiguous-subject', detail: `several characters: ${characters.join(', ')}` }
    } else if (assignments[0]) {
        assignment = assignments[0]
    } else if (file.categories.some((category) => UNIDENTIFIED_COSPLAY.test(category))) {
        return { rejected: 'ambiguous-subject', detail: 'cosplay of an unidentified character' }
    } else {
        // Only reachable for files listed under the objects root.
        assignment = { label: 'other', subcategory: 'objects' }
    }
    if (assignment === 'exclude')
        return { rejected: 'ambiguous-subject', detail: `excluded character: ${characters[0]}` }

    let { subcategory } = assignment
    if (assignment.label !== 'other' && subcategory === 'unspecified') {
        const game = inferGame(file)
        if (game && isRawSubcategory(assignment.label, game)) subcategory = game
    }

    const useOriginal =
        (file.bytes <= MAX_ORIGINAL_BYTES && file.width * file.height <= MAX_ORIGINAL_PIXELS) || !file.scaledUrl
    const author = file.author
    return {
        candidate: {
            url: useOriginal ? file.originalUrl : file.scaledUrl!,
            sourcePageUrl: file.pageUrl,
            originalImageUrl: file.originalUrl,
            sourceName: COMMONS_SOURCE_NAME,
            title: file.title,
            label: assignment.label,
            subcategory,
            license: file.license,
            licenseUrl: file.licenseUrl,
            author,
            attribution: file.attributionRequired
                ? (file.credit ?? `${author ?? 'Unknown author'}, ${file.license}, via Wikimedia Commons`)
                : null,
            variant: useOriginal ? 'original' : 'rendition',
            // Cosplay is fan-made; photos of objects may show replicas or official merchandise: not knowable.
            contentOrigin: assignment.subcategory === 'objects' ? 'unknown' : 'fan-made',
        },
    }
}
