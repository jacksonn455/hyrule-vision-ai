import type { DownloadDeps, DownloadOptions } from '../http-client.ts'
import { downloadWithRetry } from '../http-client.ts'

export const COMMONS_SOURCE_NAME = 'Wikimedia Commons'
export const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php'

/** Only renditions at Wikimedia's standard thumbnail widths are served without being rate-limited harder. */
export const COMMONS_SCALED_WIDTH = 1920

/** What we need to know about one file on Commons to decide whether, and how, to use it. */
export interface CommonsFile {
    title: string
    pageUrl: string
    originalUrl: string
    /** Rendition at COMMONS_SCALED_WIDTH, used when the original is too heavy. Absent for small images. */
    scaledUrl?: string
    mime: string
    width: number
    height: number
    bytes: number
    /** Visible (non-hidden) categories, e.g. "Category:Cosplay of Link". */
    categories: string[]
    license: string
    licenseUrl?: string
    author?: string
    /** Commons' own credit line, when the license requires attribution. */
    attributionRequired: boolean
    credit?: string
    description: string
}

interface ApiCategoryMembers {
    query?: { categorymembers: { ns: number; title: string }[] }
    continue?: Record<string, string>
}

interface ApiImageInfo {
    query?: {
        pages: {
            title: string
            missing?: boolean
            categories?: { title: string }[]
            imageinfo?: {
                url: string
                thumburl?: string
                descriptionurl: string
                mime: string
                width: number
                height: number
                size: number
                extmetadata?: Record<string, { value: string } | undefined>
            }[]
        }[]
    }
    continue?: Record<string, string>
}

const NAMESPACE_FILE = 6
const NAMESPACE_CATEGORY = 14

/** Commons stores author and description as HTML snippets. */
export function stripHtml(html: string | undefined): string {
    return (html ?? '')
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

/**
 * Read-only client for the public MediaWiki Action API of Wikimedia Commons. No account or key needed.
 * Every request goes through the same throttle so we stay inside Wikimedia's published rate limits
 * (https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits).
 */
export class WikimediaCommonsClient {
    private readonly http: DownloadOptions
    private readonly throttle: () => Promise<void>
    private readonly deps?: DownloadDeps
    private readonly apiUrl: string

    /** `apiUrl` defaults to Commons; any MediaWiki (e.g. English Wikipedia) exposes the same API. */
    constructor(http: DownloadOptions, throttle: () => Promise<void>, deps?: DownloadDeps, apiUrl = COMMONS_API_URL) {
        this.apiUrl = apiUrl
        this.http = http
        this.throttle = throttle
        this.deps = deps
    }

    /** All files in a category and its sub-categories down to `depth` levels. */
    async listFilesInCategory(category: string, depth: number, visited = new Set<string>()): Promise<Set<string>> {
        const files = new Set<string>()
        if (visited.has(category)) return files
        visited.add(category)

        let cont: Record<string, string> = {}
        do {
            const response = await this.query<ApiCategoryMembers>({
                list: 'categorymembers',
                cmtitle: category,
                cmtype: 'file|subcat',
                cmlimit: '500',
                ...cont,
            })
            for (const member of response.query?.categorymembers ?? []) {
                if (member.ns === NAMESPACE_FILE) files.add(member.title)
                if (member.ns === NAMESPACE_CATEGORY && depth > 0) {
                    for (const file of await this.listFilesInCategory(member.title, depth - 1, visited)) files.add(file)
                }
            }
            cont = response.continue ?? {}
        } while (Object.keys(cont).length > 0)
        return files
    }

    /** License, size, categories and URLs of up to 50 files per request. */
    async getFiles(titles: readonly string[]): Promise<CommonsFile[]> {
        const files: CommonsFile[] = []
        for (let i = 0; i < titles.length; i += 50) {
            const response = await this.query<ApiImageInfo>({
                titles: titles.slice(i, i + 50).join('|'),
                prop: 'imageinfo|categories',
                clshow: '!hidden',
                cllimit: 'max',
                iiprop: 'url|size|mime|extmetadata',
                iiurlwidth: String(COMMONS_SCALED_WIDTH),
                iiextmetadatafilter:
                    'LicenseShortName|LicenseUrl|Artist|AttributionRequired|Attribution|ImageDescription',
            })
            for (const page of response.query?.pages ?? []) {
                const info = page.imageinfo?.[0]
                if (page.missing || !info) continue
                const meta = info.extmetadata ?? {}
                files.push({
                    title: page.title,
                    pageUrl: info.descriptionurl,
                    originalUrl: info.url,
                    scaledUrl: info.thumburl && info.thumburl !== info.url ? info.thumburl : undefined,
                    mime: info.mime,
                    width: info.width,
                    height: info.height,
                    bytes: info.size,
                    categories: (page.categories ?? []).map((c) => c.title),
                    license: stripHtml(meta.LicenseShortName?.value) || 'unknown',
                    licenseUrl: meta.LicenseUrl?.value,
                    author: stripHtml(meta.Artist?.value) || undefined,
                    attributionRequired: meta.AttributionRequired?.value !== 'false',
                    credit: stripHtml(meta.Attribution?.value) || undefined,
                    description: stripHtml(meta.ImageDescription?.value).slice(0, 500),
                })
            }
        }
        return files
    }

    private async query<T>(params: Record<string, string>): Promise<T> {
        await this.throttle()
        const search = new URLSearchParams({
            action: 'query',
            format: 'json',
            formatversion: '2',
            maxlag: '5',
            ...params,
        })
        const { buffer } = await downloadWithRetry(`${this.apiUrl}?${search.toString()}`, this.http, this.deps)
        return JSON.parse(buffer.toString('utf8')) as T
    }
}
