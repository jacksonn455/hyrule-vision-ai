import type { ImageCandidate, RejectionReason } from '../types.ts'
import type { RawSubcategory } from '../taxonomy.ts'
import type { HuggingFaceImageRow } from './huggingface-rows.ts'
import { huggingFaceRowId } from './huggingface-rows.ts'

export const BOTW_DATASET = 'XeIaso/botw-screenshots-captioned'
export const BOTW_SOURCE_NAME = `Hugging Face: ${BOTW_DATASET}`
const BOTW_LICENSE = 'No license stated (game screenshots © Nintendo)'

export type CaptionDecision =
    { label: ImageCandidate['label']; subcategory: RawSubcategory } | { rejected: RejectionReason; detail: string }

/** Menus, dialogue boxes and maps teach the model nothing about characters. */
const UI_SCREEN =
    /inventory|dialog(ue)?\b|text box|text overlay|map screen|\bmenu\b|name selection|loading screen|title screen|item display|screen capture|tip:/

/** First match wins, so the most specific groups come first. */
const OTHER_SUBJECTS: readonly [RawSubcategory, RegExp][] = [
    ['ganondorf', /\bganon|calamity/],
    ['sidon', /sidon|sydon/],
    ['revali', /revali/],
    ['mipha', /mipha/],
    ['urbosa', /urbosa/],
    ['daruk', /daruk/],
    ['impa', /\bimpa\b/],
    ['purah', /purah/],
    ['paya', /\bpaya\b/],
    ['riju', /riju/],
    ['hylia', /hylia|goddess/],
    ['other-characters', /robbie|yunobo|\bteba\b/],
    ['enemies', /bokoblin|moblin|lizalfos|lynel|hinox|guardian(?! armor)|talus|wizzrobe|\byiga|chuchu|keese|octorok/],
    [
        'npcs',
        /hylians?\b|gerudo|goron|\bzora\b|\brito\b|dorephan|\bkass\b|hestu|beedle|villager|merchant|king rhoam|\bmonk\b/,
    ],
    ['creatures', /horse|epona|korok|dragon|naydra|dinraal|farosh|\bfox\b|\bdeer\b|\bbear\b|\bboar\b|\bwolf\b/],
]

/**
 * Pre-labels a screenshot from its caption. Captions were written for text-to-image training and are not always
 * right, so this is deliberately conservative: anything with two possible main subjects is rejected, and the
 * result is reviewed visually afterwards.
 */
export function classifyBotwCaption(caption: string): CaptionDecision {
    // "The Legend of Zelda" is in almost every caption and says nothing about who is on screen.
    const text = caption.toLowerCase().replace(/legend of zelda|zelda game|zelda series/g, '')
    if (UI_SCREEN.test(text)) return { rejected: 'off-topic', detail: 'UI screen (menu, dialogue, map)' }

    const hasLink = /\blink\b/.test(text)
    const hasZelda = /\bzelda\b/.test(text)
    const others = OTHER_SUBJECTS.filter(([, pattern]) => pattern.test(text)).map(([subcategory]) => subcategory)
    // Link is almost always on a horse or next to an animal in BotW: creatures do not compete with him.
    const competingOthers = others.filter((subcategory) => subcategory !== 'creatures')

    if (hasLink && hasZelda) return { rejected: 'ambiguous-subject', detail: 'Link and Zelda' }
    if (hasLink && competingOthers.length > 0) {
        return { rejected: 'ambiguous-subject', detail: `Link and ${competingOthers.join(', ')}` }
    }
    if (hasZelda && others.length > 0)
        return { rejected: 'ambiguous-subject', detail: `Zelda and ${others.join(', ')}` }
    if (hasLink) return { label: 'link', subcategory: 'breath-of-the-wild' }
    if (hasZelda) return { label: 'zelda', subcategory: 'breath-of-the-wild' }
    if (others[0]) return { label: 'other', subcategory: others[0] }
    return { rejected: 'off-topic', detail: 'no identifiable character in caption' }
}

export function planBotwCandidates(rows: readonly HuggingFaceImageRow[]): {
    candidates: ImageCandidate[]
    rejected: { url: string; title: string; reason: RejectionReason; detail: string }[]
} {
    const candidates: ImageCandidate[] = []
    const rejected: { url: string; title: string; reason: RejectionReason; detail: string }[] = []
    for (const row of rows) {
        const url = huggingFaceRowId(BOTW_DATASET, 'train', row.rowIndex)
        const title = `botw-screenshot-${String(row.rowIndex).padStart(4, '0')}`
        const decision = classifyBotwCaption(row.text)
        if ('rejected' in decision) {
            rejected.push({ url, title, reason: decision.rejected, detail: decision.detail })
            continue
        }
        candidates.push({
            url,
            downloadUrl: row.imageUrl,
            sourcePageUrl: url,
            sourceName: BOTW_SOURCE_NAME,
            title,
            ...decision,
            license: BOTW_LICENSE,
            licenseUrl: undefined,
            author: 'XeIaso (dataset); Nintendo (game)',
            attribution:
                'The Legend of Zelda: Breath of the Wild © Nintendo. Screenshot dataset by XeIaso on Hugging Face.',
            // The datasets-server serves a JPEG copy of the image stored in the dataset's Parquet files.
            variant: 'rendition',
            contentOrigin: 'official',
        })
    }
    return { candidates, rejected }
}
