import { OTHER_LABEL } from '@hyrule/shared'

import type { Task } from '../paths.ts'

/**
 * Top-level folders of data/raw that are NOT a character: they always go to "other".
 * Every other top-level folder is a character (link, zelda, midna, skull-kid, …).
 */
export const NON_CHARACTER_FOLDERS = new Set([
    OTHER_LABEL,
    'objects',
    'enemies',
    'npcs',
    'creatures',
    'other-characters',
])

/**
 * Characters left out of the character model: below 50% test recall after the cleaning of 2026-11-18 (web images
 * too noisy, or too often in the same picture as Link). Their images stay in data/raw, are not merged into "other"
 * (they would teach "other" to look like a character), and Link/Zelda game folders still feed the game model.
 * Remove a name from here (and re-run split-dataset + train) to bring it back.
 */
export const EXCLUDED_CHARACTERS = new Set(['zelda', 'impa', 'tingle', 'paya', 'malon', 'fi', 'zant', 'riju'])

/**
 * Whether the character model has an "other" class (small characters, objects, enemies…). Off since 2026-11-18: those
 * images are too varied to be learned as one class and only blurred the real characters. The model now always answers
 * one of the trained characters.
 */
export const INCLUDE_OTHER = false

/** Game sub-folder that means "game unknown": useless for the game model. */
export const UNKNOWN_GAME = 'unspecified'

/** Below this many images a class cannot be learned (nor measured: 15% test of 6 images = 1 image). */
export const DEFAULT_MIN_IMAGES = 10

/** One image of data/raw, already assigned to a class of one task. */
export interface LabeledImage {
    /** Path relative to data/raw, with forward slashes, e.g. "link/wind-waker/x.jpg". */
    relativePath: string
    label: string
    /** Folder the image came from (e.g. "link/wind-waker", "midna"); used to stratify the split. */
    group: string
}

/** What split-dataset decided, saved as data/dataset/<task>/classes.json and read by train. */
export interface TaskClasses {
    task: Task
    minImages: number
    /** Output-layer order of the model. */
    labels: string[]
    /** Images per class (before splitting). */
    counts: Record<string, number>
    /** characters: folders too small to be a class, merged into "other". games: games skipped (too few images). */
    belowThreshold: Record<string, number>
    /** games: characters whose per-game folders were used. */
    characters: string[]
    /** characters: folders left out on purpose (EXCLUDED_CHARACTERS), with their image counts. */
    excluded?: Record<string, number>
}

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
    const counts = new Map<string, number>()
    for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1)
    return counts
}

/**
 * The character an image belongs to: its top-level folder ("midna/x.jpg" → midna), or, for images the collector
 * filed under the "other" collection label, the folder below it ("other/midna/x.jpg" → midna). Both layouts work.
 */
export function characterFolder(relativePath: string): string {
    const parts = relativePath.toLowerCase().split('/')
    return parts[0] === OTHER_LABEL && parts.length > 2 ? parts[1]! : parts[0]!
}

/** Most images first (ties alphabetical): a stable, readable output order. */
function byCountDesc(counts: Map<string, number>): string[] {
    return [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b))
}

/**
 * Character classes: every top-level folder of data/raw with at least `minImages` images is a class.
 * Smaller character folders, and non-character folders (objects, …), are merged into "other" — they are
 * still useful as examples of "not one of the known characters". Add images to a folder and re-run
 * split-dataset + train: once it reaches `minImages` it becomes a class of its own.
 */
export function characterClasses(
    allPaths: string[],
    minImages = DEFAULT_MIN_IMAGES,
    excludedCharacters: ReadonlySet<string> = EXCLUDED_CHARACTERS,
    includeOther = INCLUDE_OTHER,
) {
    const excluded = countBy(
        allPaths.filter((p) => excludedCharacters.has(characterFolder(p))),
        characterFolder,
    )
    const relativePaths = allPaths.filter((p) => !excludedCharacters.has(characterFolder(p)))
    const counts = countBy(relativePaths, characterFolder)
    const characters = byCountDesc(counts).filter(
        (folder) => !NON_CHARACTER_FOLDERS.has(folder) && counts.get(folder)! >= minImages,
    )
    const belowThreshold = Object.fromEntries(
        byCountDesc(counts)
            .filter((folder) => !NON_CHARACTER_FOLDERS.has(folder) && counts.get(folder)! < minImages)
            .map((folder) => [folder, counts.get(folder)!]),
    )
    const isClass = new Set(characters)
    const images: LabeledImage[] = relativePaths
        .map((relativePath) => {
            const folder = characterFolder(relativePath)
            return {
                relativePath,
                label: isClass.has(folder) ? folder : OTHER_LABEL,
                group: relativePath.split('/').slice(0, -1).join('/') || folder,
            }
        })
        .filter((image) => includeOther || image.label !== OTHER_LABEL)
    const labels = images.some((image) => image.label === OTHER_LABEL) ? [...characters, OTHER_LABEL] : characters
    const classes: TaskClasses = {
        task: 'characters',
        minImages,
        labels,
        counts: Object.fromEntries(countBy(images, (i) => i.label)),
        belowThreshold,
        characters: [],
        excluded: Object.fromEntries(byCountDesc(excluded).map((folder) => [folder, excluded.get(folder)!])),
    }
    return { images, classes }
}

/**
 * Game classes: images stored as data/raw/<character>/<game>/<file> (Link and Zelda today), pooled across
 * characters — the game is mostly the art style, which is the same for Link and Zelda in a given game.
 * "unspecified" and games with fewer than `minImages` images are left out (there is no "other game" class).
 */
export function gameClasses(relativePaths: string[], minImages = DEFAULT_MIN_IMAGES) {
    const candidates = relativePaths
        .map((relativePath) => relativePath.split('/'))
        // Only real characters have game sub-folders ("other/midna/x.jpg" is a character, not a game).
        .filter(
            (parts) =>
                parts.length === 3 &&
                !NON_CHARACTER_FOLDERS.has(parts[0]!.toLowerCase()) &&
                parts[1]!.toLowerCase() !== UNKNOWN_GAME,
        )
        .map((parts) => ({
            relativePath: parts.join('/'),
            character: parts[0]!.toLowerCase(),
            game: parts[1]!.toLowerCase(),
        }))
    const counts = countBy(candidates, (c) => c.game)
    const labels = byCountDesc(counts).filter((game) => counts.get(game)! >= minImages)
    const isClass = new Set(labels)
    const images: LabeledImage[] = candidates
        .filter((c) => isClass.has(c.game))
        .map((c) => ({ relativePath: c.relativePath, label: c.game, group: `${c.character}/${c.game}` }))
    const classes: TaskClasses = {
        task: 'games',
        minImages,
        labels,
        counts: Object.fromEntries(labels.map((l) => [l, counts.get(l)!])),
        belowThreshold: Object.fromEntries(
            byCountDesc(counts)
                .filter((g) => !isClass.has(g))
                .map((g) => [g, counts.get(g)!]),
        ),
        characters: [...new Set(images.map((i) => i.relativePath.split('/')[0]!.toLowerCase()))].sort(),
    }
    return { images, classes }
}

export function classesForTask(task: Task, relativePaths: string[], minImages = DEFAULT_MIN_IMAGES) {
    return task === 'characters' ? characterClasses(relativePaths, minImages) : gameClasses(relativePaths, minImages)
}
