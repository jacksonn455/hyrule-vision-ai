import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import type { CollectionLabel } from '@hyrule/shared'
import { isCollectionLabel } from '@hyrule/shared'
import sharp from 'sharp'

import { hasAllowedExtension } from './image-validator.ts'
import type { RawSubcategory } from './taxonomy.ts'
import { isRawSubcategory } from './taxonomy.ts'
import type { ImageCandidate } from './types.ts'

export const MANUAL_SOURCE_NAME = 'Manual import'
export const MANUAL_LICENSE = 'Unknown (imported by hand; private study only)'

/** Names browsers and sites give to downloads; they say nothing about the picture. */
const GENERIC_NAME =
    /^(images?|img|download(ed)?|unnamed|untitled|photo|picture|pic|file|image\d*|screenshot|captura|imagem|sem[-_ ]?t[ií]tulo|[0-9a-f]{8,}|[0-9a-z]{20,}|\d+|[-_\s()\d]+)$/i

/** "images (3).jpeg" → true, "zelda-twilight-princess-artwork.png" → false */
export function isGenericFilename(name: string): boolean {
    const base = path
        .parse(name)
        .name.replace(/[\s_-]*\(\d+\)$/, '')
        .trim()
    return base.length < 3 || GENERIC_NAME.test(base)
}

export interface SourceHints {
    /** Where the browser downloaded the file from (Windows "Zone.Identifier", HostUrl). */
    hostUrl?: string
    /** The page that was open when it was saved (Windows "Zone.Identifier", ReferrerUrl). */
    referrerUrl?: string
    /** Credits embedded in the image itself (XMP). */
    creator?: string
    rights?: string
}

const httpUrl = (value: string | undefined): string | undefined =>
    value && /^https?:\/\//i.test(value.trim()) ? value.trim() : undefined

/** Parses the text Windows stores in a downloaded file's "Zone.Identifier" stream. */
export function parseZoneIdentifier(text: string): Pick<SourceHints, 'hostUrl' | 'referrerUrl'> {
    const value = (key: string) => new RegExp(`^${key}=(.*)$`, 'mi').exec(text)?.[1]
    return { hostUrl: httpUrl(value('HostUrl')), referrerUrl: httpUrl(value('ReferrerUrl')) }
}

/** Creator / rights from embedded XMP (photo agencies, artists and many sites fill these in). */
export async function readEmbeddedCredits(buffer: Buffer): Promise<Pick<SourceHints, 'creator' | 'rights'>> {
    const xmp = await sharp(buffer)
        .metadata()
        .then((m) => m.xmp?.toString('utf8') ?? '')
        .catch(() => '')
    const first = (tag: string) => {
        const block = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xmp)?.[1] ?? ''
        const text = (/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/.exec(block)?.[1] ?? block).replace(/<[^>]+>/g, '').trim()
        return text || undefined
    }
    return { creator: first('dc:creator'), rights: first('dc:rights') }
}

/**
 * Reads "Zone.Identifier" for many files at once. On Windows it is an alternate data stream (file:Zone.Identifier).
 * WSL cannot see those streams, so for /mnt/<drive>/ paths one PowerShell call reads them all. Missing streams
 * (file copied from a USB stick, saved by another program...) simply give no hints.
 */
export async function readZoneIdentifiers(files: readonly string[]): Promise<Map<string, SourceHints>> {
    const hints = new Map<string, SourceHints>()
    if (process.platform === 'win32') {
        for (const file of files) {
            const text = await readFile(`${file}:Zone.Identifier`, 'utf8').catch(() => '')
            if (text) hints.set(file, parseZoneIdentifier(text))
        }
        return hints
    }
    const windowsPaths = new Map(
        files
            .map((file) => [file, /^\/mnt\/([a-z])\/(.*)$/.exec(file)] as const)
            .filter((entry): entry is readonly [string, RegExpExecArray] => entry[1] !== null)
            .map(([file, m]) => [`${m[1]!.toUpperCase()}:\\${m[2]!.replaceAll('/', '\\')}`, file]),
    )
    if (windowsPaths.size === 0) return hints
    const script =
        '$paths = [Console]::In.ReadToEnd() | ConvertFrom-Json; $out = @{}; ' +
        'foreach ($p in $paths) { try { $out[$p] = (Get-Content -LiteralPath $p -Stream Zone.Identifier -Raw -ErrorAction Stop) } catch {} }; ' +
        '$out | ConvertTo-Json -Compress'
    try {
        const child = promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
            maxBuffer: 16 * 1024 * 1024,
        })
        child.child.stdin?.end(JSON.stringify([...windowsPaths.keys()]))
        const { stdout } = await child
        const parsed = JSON.parse(stdout.trim() || '{}') as Record<string, string>
        for (const [windowsPath, text] of Object.entries(parsed)) {
            const file = windowsPaths.get(windowsPath)
            if (file && text) hints.set(file, parseZoneIdentifier(text))
        }
    } catch {
        // No PowerShell (plain Linux) or it failed: hints are optional.
    }
    return hints
}

export interface ManualFile {
    /** Absolute path of the file to read. */
    file: string
    label: CollectionLabel
    subcategory: RawSubcategory
    /** Name the user gave the file (for frames: "<sheet name>-frame-03"). */
    originalFilename: string
    sha256: string
    hints?: SourceHints
    derivedFrom?: ImageCandidate['derivedFrom']
}

/**
 * Builds the candidate for an image imported by hand. Only facts are recorded: what the browser or the file itself
 * says about its origin. Nothing is filled in when nothing is known.
 */
export function manualCandidate(input: ManualFile): ImageCandidate {
    const { hints = {} } = input
    const useful = !isGenericFilename(input.originalFilename)
    return {
        // Identity = content: the same picture imported twice under different names is recognised.
        url: `manual:sha256:${input.sha256}`,
        downloadUrl: pathToFileURL(input.file).href,
        sourcePageUrl: hints.referrerUrl,
        originalImageUrl: hints.hostUrl,
        sourceName: MANUAL_SOURCE_NAME,
        title: useful ? path.parse(input.originalFilename).name : 'manual-import',
        label: input.label,
        subcategory: input.subcategory,
        license: hints.rights ? `${MANUAL_LICENSE}; embedded rights: ${hints.rights}` : MANUAL_LICENSE,
        author: hints.creator,
        attribution: hints.creator ?? null,
        variant: input.derivedFrom ? 'rendition' : 'original',
        contentOrigin: 'unknown',
        originalFilename: input.originalFilename,
        derivedFrom: input.derivedFrom,
    }
}

export interface InboxFile {
    file: string
    label: CollectionLabel
    subcategory: RawSubcategory
    /** True for files under data/inbox/sprite-sheets/: cut into frames before import. */
    isSpriteSheet: boolean
}

/**
 * Lists data/inbox/<label>/<subcategory>/* and data/inbox/sprite-sheets/<label>/<subcategory>/*.
 * The folder is the label, exactly like data/raw. Files anywhere else are reported, never guessed.
 */
export async function listInbox(inboxDir: string): Promise<{ files: InboxFile[]; misplaced: string[] }> {
    const files: InboxFile[] = []
    const misplaced: string[] = []
    const entries = await readdir(inboxDir, { recursive: true, withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
        if (!entry.isFile() || entry.name.startsWith('.')) continue
        const file = path.join(entry.parentPath, entry.name)
        const parts = path.relative(inboxDir, file).split(path.sep)
        if (parts[0] === '_rejected') continue
        const isSpriteSheet = parts[0] === 'sprite-sheets'
        const [label, subcategory, name, ...rest] = isSpriteSheet ? parts.slice(1) : parts
        if (
            !hasAllowedExtension(entry.name) ||
            !label ||
            !subcategory ||
            !name ||
            rest.length > 0 ||
            !isCollectionLabel(label) ||
            !isRawSubcategory(label, subcategory)
        ) {
            misplaced.push(file)
            continue
        }
        files.push({ file, label, subcategory, isSpriteSheet })
    }
    return { files: files.sort((a, b) => a.file.localeCompare(b.file)), misplaced }
}

/** "C:\Users\me\Downloads\a.png" → "/mnt/c/Users/me/Downloads/a.png" when running under WSL. */
export function toLocalPath(input: string): string {
    const trimmed = input.trim().replace(/^["']|["']$/g, '')
    const windows = /^([a-zA-Z]):[\\/](.*)$/.exec(trimmed)
    if (process.platform !== 'win32' && windows) {
        return `/mnt/${windows[1]!.toLowerCase()}/${windows[2]!.replaceAll('\\', '/')}`
    }
    return trimmed
}
