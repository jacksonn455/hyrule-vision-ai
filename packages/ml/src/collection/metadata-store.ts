import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { PLAN_REJECTIONS, TRANSIENT_REJECTIONS } from './types.ts'
import type { ImageRecord, Rejection } from './types.ts'

export const SOURCES_FILENAME = 'sources.json'
export const REJECTIONS_FILENAME = 'rejections.json'

interface SourcesFile {
    description: string
    images: ImageRecord[]
}

interface RejectionsFile {
    description: string
    rejections: Rejection[]
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
    try {
        return JSON.parse(await readFile(file, 'utf8')) as T
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback
        throw error
    }
}

/** Write to a temp file then rename: an interrupted run never leaves a half-written JSON file behind. */
async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
    const temp = `${file}.tmp`
    await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
    await rename(temp, file)
}

/**
 * data/metadata/sources.json (every kept image, with origin, license and hashes) and
 * data/metadata/rejections.json (every refused URL and why). Saved after each image so a run can be
 * interrupted and resumed: URLs already kept, or rejected for a permanent reason, are not downloaded again.
 */
export class MetadataStore {
    private readonly dir: string
    private readonly images: ImageRecord[]
    private readonly rejections: Rejection[]

    private constructor(dir: string, images: ImageRecord[], rejections: Rejection[]) {
        this.dir = dir
        this.images = images
        this.rejections = rejections
    }

    static async load(dir: string): Promise<MetadataStore> {
        const sources = await readJson<SourcesFile>(path.join(dir, SOURCES_FILENAME), { description: '', images: [] })
        const rejected = await readJson<RejectionsFile>(path.join(dir, REJECTIONS_FILENAME), {
            description: '',
            rejections: [],
        })
        return new MetadataStore(dir, sources.images, rejected.rejections)
    }

    allImages(): readonly ImageRecord[] {
        return this.images
    }

    allRejections(): readonly Rejection[] {
        return this.rejections
    }

    hasImage(url: string): boolean {
        return this.images.some((image) => image.url === url)
    }

    /** True if the URL was refused for a reason that will not change by trying again. */
    isPermanentlyRejected(url: string): boolean {
        return this.rejections.some((r) => r.url === url && !TRANSIENT_REJECTIONS.has(r.reason))
    }

    countByLabel(label: string): number {
        return this.images.filter((image) => image.label === label).length
    }

    addImage(record: ImageRecord): void {
        this.removeRejection(record.url)
        this.images.push(record)
    }

    /** Keeps only the latest rejection per URL, so retried URLs do not inflate the counts. */
    addRejection(rejection: Rejection): void {
        this.removeRejection(rejection.url)
        this.rejections.push(rejection)
    }

    findImage(path: string): ImageRecord | undefined {
        return this.images.find((image) => image.path === path)
    }

    /** Changes a kept image's record in place (e.g. after moving its file to another sub-folder). */
    updateImage(
        path: string,
        changes: Partial<Pick<ImageRecord, 'label' | 'subcategory' | 'filename' | 'path'>>,
    ): void {
        const image = this.findImage(path)
        if (!image) throw new Error(`not in sources.json: ${path}`)
        Object.assign(image, changes)
    }

    /** Moves a kept image to the rejections (e.g. after visual review), so later runs never download it again. */
    rejectImage(path: string, reason: Rejection['reason'], detail: string, now = new Date()): ImageRecord | undefined {
        const index = this.images.findIndex((image) => image.path === path)
        if (index === -1) return undefined
        const [image] = this.images.splice(index, 1) as [ImageRecord]
        this.addRejection({
            url: image.url,
            title: image.title,
            sourceName: image.sourceName,
            label: image.label,
            subcategory: image.subcategory,
            reason,
            detail,
            rejectedAt: now.toISOString(),
        })
        return image
    }

    /**
     * Drops a rejection decided while planning (from the source's metadata), so a URL that the current rules accept
     * can be collected. Rejections decided from the image itself or by a person are kept.
     */
    forgetPlanRejection(url: string): void {
        const rejection = this.rejections.find((r) => r.url === url)
        if (rejection && PLAN_REJECTIONS.has(rejection.reason)) this.removeRejection(url)
    }

    async save(): Promise<void> {
        await mkdir(this.dir, { recursive: true })
        await writeJsonAtomic(path.join(this.dir, SOURCES_FILENAME), {
            description: 'Origin, license and hashes of every image in data/raw collected by the dataset collector.',
            images: this.images,
        } satisfies SourcesFile)
        await writeJsonAtomic(path.join(this.dir, REJECTIONS_FILENAME), {
            description: 'Images the dataset collector refused, with the reason. Used for the collection report.',
            rejections: this.rejections,
        } satisfies RejectionsFile)
    }

    private removeRejection(url: string): void {
        const index = this.rejections.findIndex((r) => r.url === url)
        if (index !== -1) this.rejections.splice(index, 1)
    }
}
