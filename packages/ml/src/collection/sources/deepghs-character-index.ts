import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { CollectionLabel } from '@hyrule/shared'

import type { RawSubcategory } from '../taxonomy.ts'
import { isRawSubcategory } from '../taxonomy.ts'
import type { ImageCandidate, RejectionReason } from '../types.ts'
import { readZip } from '../zip-reader.ts'

export const DEEPGHS_DATASET = 'deepghs/character_index'
export const DEEPGHS_SOURCE_NAME = `Hugging Face: ${DEEPGHS_DATASET}`
const REPO_URL = `https://huggingface.co/datasets/${DEEPGHS_DATASET}`

export interface DeepghsCharacter {
    /** Danbooru character tag, e.g. "princess_zelda". */
    tag: string
    /** Folder in the dataset repository, e.g. "e9/princess_zelda". */
    folder: string
    label: CollectionLabel
    /** Used when the post does not name exactly one game. */
    subcategory: RawSubcategory
}

/**
 * Characters we take, from the dataset's index page (pages/the_legend_of_zelda.md). Each folder holds an
 * images.zip with ~50 person crops from Danbooru fan art, plus the post metadata.
 */
export const DEEPGHS_CHARACTERS: readonly DeepghsCharacter[] = [
    { tag: 'link', folder: '4f/link', label: 'link', subcategory: 'unspecified' },
    { tag: 'toon_link', folder: '19/toon_link', label: 'link', subcategory: 'unspecified' },
    { tag: 'young_link', folder: 'd6/young_link', label: 'link', subcategory: 'unspecified' },
    { tag: 'princess_zelda', folder: 'e9/princess_zelda', label: 'zelda', subcategory: 'unspecified' },
    { tag: 'young_zelda', folder: 'cb/young_zelda', label: 'zelda', subcategory: 'unspecified' },
    { tag: 'toon_zelda', folder: '49/toon_zelda', label: 'zelda', subcategory: 'unspecified' },
    { tag: 'tetra', folder: '4b/tetra', label: 'zelda', subcategory: 'wind-waker' },
    {
        tag: 'light_dragon_(zelda)',
        folder: '6d/light_dragon_zelda',
        label: 'zelda',
        subcategory: 'tears-of-the-kingdom',
    },
    { tag: 'ganondorf', folder: '58/ganondorf', label: 'other', subcategory: 'ganondorf' },
    { tag: 'midna', folder: '26/midna', label: 'other', subcategory: 'midna' },
    { tag: 'midna_(true)', folder: '25/midna_true', label: 'other', subcategory: 'midna' },
    { tag: 'purah', folder: 'ec/purah', label: 'other', subcategory: 'purah' },
    { tag: 'mipha', folder: 'ea/mipha', label: 'other', subcategory: 'mipha' },
    { tag: 'urbosa', folder: '49/urbosa', label: 'other', subcategory: 'urbosa' },
    { tag: 'sidon', folder: '04/sidon', label: 'other', subcategory: 'sidon' },
    { tag: 'impa', folder: '9c/impa', label: 'other', subcategory: 'impa' },
    { tag: 'paya_(zelda)', folder: '18/paya_zelda', label: 'other', subcategory: 'paya' },
    { tag: 'saria_(zelda)', folder: '06/saria_zelda', label: 'other', subcategory: 'saria' },
    { tag: 'riju', folder: 'dd/riju', label: 'other', subcategory: 'riju' },
    { tag: 'fi_(zelda)', folder: '04/fi_zelda', label: 'other', subcategory: 'fi' },
    { tag: 'malon', folder: 'e0/malon', label: 'other', subcategory: 'malon' },
]

/**
 * Characters we do NOT take, but whose presence in a crop makes it ambiguous: Sheik (Zelda in disguise, kept out
 * of this first experiment), Link's transformations, and tags whose images mostly show Link (Navi, Korok, Majora,
 * Revali: their "core tags" in the index are Link's).
 */
const EXCLUDED_TAGS = ['sheik', 'wolf_link', 'fierce_deity', 'navi', 'korok', 'majora_(entity)', 'revali']

const LABEL_BY_TAG = new Map<string, CollectionLabel | 'excluded'>([
    ...DEEPGHS_CHARACTERS.map((c) => [c.tag, c.label] as const),
    ...EXCLUDED_TAGS.map((tag) => [tag, 'excluded'] as const),
])

/**
 * Danbooru ratings: g = general, s = sensitive, q = questionable, e = explicit. Only "general" is kept: the visual
 * review showed that most "sensitive" fan art of these characters is sexualised.
 */
const ALLOWED_RATINGS = new Set(['g'])
const TAG_THRESHOLD = 0.5
const SEVERAL_PEOPLE = /^(multiple_(girls|boys)|[2-9]\+?(girls|boys))$/

const GAME_BY_COPYRIGHT: readonly [RegExp, RawSubcategory][] = [
    [/tears_of_the_kingdom/, 'tears-of-the-kingdom'],
    [/breath_of_the_wild/, 'breath-of-the-wild'],
    [/skyward_sword/, 'skyward-sword'],
    [/twilight_princess/, 'twilight-princess'],
    [/wind_waker/, 'wind-waker'],
    [/majora/, 'majoras-mask'],
    [/ocarina_of_time/, 'ocarina-of-time'],
    [/a_link_to_the_past/, 'a-link-to-the-past'],
]

/** The fields of the per-crop metadata file we rely on. */
export interface DeepghsCropMeta {
    danbooru: {
        id: number
        rating: string
        source?: string
        tag_string_artist?: string
        tag_string_copyright?: string
        /** Characters named on the whole post (a post can show several people). */
        tag_string_character?: string
    }
    url?: string
    tags: Record<string, number>
}

export type CropDecision =
    | { label: CollectionLabel; subcategory: RawSubcategory; game?: RawSubcategory }
    | { rejected: RejectionReason; detail: string }

/** Game named in the post's copyright tags, only when exactly one is named. */
export function gameFromCopyright(copyright: string | undefined): RawSubcategory | undefined {
    const games = new Set(GAME_BY_COPYRIGHT.filter(([pattern]) => pattern.test(copyright ?? '')).map(([, g]) => g))
    return games.size === 1 ? [...games][0] : undefined
}

export function classifyCrop(character: DeepghsCharacter, meta: DeepghsCropMeta): CropDecision {
    if (!ALLOWED_RATINGS.has(meta.danbooru.rating)) {
        return { rejected: 'content-rating', detail: `Danbooru rating "${meta.danbooru.rating}"` }
    }
    const detected = Object.entries(meta.tags).filter(([, score]) => score >= TAG_THRESHOLD)
    // A crop of someone else from the same post must not slip in. Either the crop tagger names the character, or
    // the crop shows one person ("solo") and every character named on the post belongs to the same class.
    // (The tagger often misses variants such as Toon Zelda or Tetra, which the post itself names correctly.)
    const postCharacters = (meta.danbooru.tag_string_character ?? '').split(' ').filter(Boolean)
    const recognised = detected.some(([tag]) => tag === character.tag)
    const soloOfThisClass =
        detected.some(([tag]) => tag === 'solo') &&
        postCharacters.includes(character.tag) &&
        postCharacters.every((tag) => LABEL_BY_TAG.get(tag) === character.label)
    if (!recognised && !soloOfThisClass) {
        return { rejected: 'ambiguous-subject', detail: `${character.tag} not recognised in the crop` }
    }
    const labels = new Set(detected.map(([tag]) => LABEL_BY_TAG.get(tag)).filter((label) => label !== undefined))
    if (labels.size > 1)
        return { rejected: 'ambiguous-subject', detail: `several characters: ${[...labels].join(', ')}` }
    const crowd = detected.map(([tag]) => tag).filter((tag) => SEVERAL_PEOPLE.test(tag))
    if (detected.some(([t]) => t === '1girl') && detected.some(([t]) => t === '1boy')) crowd.push('1girl + 1boy')
    if (crowd.length > 0) return { rejected: 'ambiguous-subject', detail: `several people: ${crowd.join(', ')}` }

    const game = gameFromCopyright(meta.danbooru.tag_string_copyright)
    const subcategory =
        game && isRawSubcategory(character.label, game) && character.subcategory === 'unspecified'
            ? game
            : character.subcategory
    return { label: character.label, subcategory, game }
}

function cropCandidate(
    character: DeepghsCharacter,
    decision: { label: CollectionLabel; subcategory: RawSubcategory },
    filename: string,
    meta: DeepghsCropMeta,
    cachedFile: string,
): ImageCandidate {
    const { id, source, tag_string_artist: artist } = meta.danbooru
    const post = `https://danbooru.donmai.us/posts/${id}`
    return {
        url: `${REPO_URL}/blob/main/${character.folder}/images.zip#${filename}`,
        downloadUrl: pathToFileURL(cachedFile).href,
        sourcePageUrl: post,
        originalImageUrl: source?.startsWith('http') ? source : meta.url,
        sourceName: DEEPGHS_SOURCE_NAME,
        title: `${character.tag.replace(/[()]/g, '')}-${filename}`,
        label: decision.label,
        subcategory: decision.subcategory,
        license: 'Unknown: fan art © its artist, character © Nintendo (index dataset itself: MIT)',
        licenseUrl: undefined,
        author: artist || undefined,
        attribution: artist ? `Fan art by ${artist}, Danbooru post ${id}` : `Danbooru post ${id}`,
        // A person crop, re-encoded as WebP by the dataset authors.
        variant: 'rendition',
        contentOrigin: 'fan-made',
    }
}

export interface DeepghsPlan {
    candidates: ImageCandidate[]
    rejected: { url: string; title: string; reason: RejectionReason; detail: string }[]
}

/**
 * Downloads each character's images.zip once (cached in `cacheDir`), keeps the crops that pass `classifyCrop`
 * and extracts them next to the zip so the collector can read them like any other file.
 */
export async function planDeepghsCandidates(
    cacheDir: string,
    downloadZip: (url: string) => Promise<Buffer>,
    characters: readonly DeepghsCharacter[] = DEEPGHS_CHARACTERS,
): Promise<DeepghsPlan> {
    const plan: DeepghsPlan = { candidates: [], rejected: [] }
    for (const character of characters) {
        const dir = path.join(cacheDir, character.folder)
        const zipFile = path.join(dir, 'images.zip')
        await mkdir(dir, { recursive: true })
        let zip: Buffer
        try {
            zip = await readFile(zipFile)
        } catch {
            zip = await downloadZip(`${REPO_URL}/resolve/main/${character.folder}/images.zip`)
            await writeFile(zipFile, zip)
        }

        const entries = new Map(readZip(zip).map((entry) => [entry.name, entry]))
        for (const [name, entry] of entries) {
            const match = /^([\w-]+)\.(webp|png|jpe?g)$/i.exec(name)
            const metaEntry = match ? entries.get(`.${match[1]}_meta.json`) : undefined
            if (!match || !metaEntry) continue
            const meta = JSON.parse(metaEntry.read().toString('utf8')) as DeepghsCropMeta
            const decision = classifyCrop(character, meta)
            const url = `${REPO_URL}/blob/main/${character.folder}/images.zip#${name}`
            if ('rejected' in decision) {
                plan.rejected.push({ url, title: name, reason: decision.rejected, detail: decision.detail })
                continue
            }
            // `name` passed the regex above: no path separators, safe as a file name.
            const cached = path.join(dir, name)
            await writeFile(cached, entry.read(), { flag: 'w' })
            plan.candidates.push(cropCandidate(character, decision, name, meta, cached))
        }
    }
    return plan
}
