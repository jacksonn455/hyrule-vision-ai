import type { DownloadDeps, DownloadOptions } from '../http-client.ts'
import { downloadWithRetry } from '../http-client.ts'

const ROWS_API = 'https://datasets-server.huggingface.co/rows'
const PAGE_SIZE = 100

export interface HuggingFaceImageRow {
    rowIndex: number
    /** Signed URL of the image served by the datasets-server. It expires after a while: fetch rows right before use. */
    imageUrl: string
    width: number
    height: number
    /** Caption / text column of the row ('' if the dataset has none). */
    text: string
}

interface RowsResponse {
    num_rows_total: number
    rows: { row_idx: number; row: Record<string, unknown> }[]
}

interface ImageCell {
    src: string
    width: number
    height: number
}

/**
 * Reads the rows of a public, non-gated Hugging Face dataset through the official datasets-server JSON API.
 * Images come back as URLs, so no Parquet reader (and no extra dependency) is needed.
 */
export class HuggingFaceRowsClient {
    private readonly http: DownloadOptions
    private readonly throttle: () => Promise<void>
    private readonly deps?: DownloadDeps

    constructor(http: DownloadOptions, throttle: () => Promise<void>, deps?: DownloadDeps) {
        this.http = http
        this.throttle = throttle
        this.deps = deps
    }

    async listImageRows(
        dataset: string,
        { config = 'default', split = 'train', imageColumn = 'image', textColumn = 'text' } = {},
    ): Promise<HuggingFaceImageRow[]> {
        const rows: HuggingFaceImageRow[] = []
        for (let offset = 0, total = Infinity; offset < total; offset += PAGE_SIZE) {
            await this.throttle()
            const search = new URLSearchParams({
                dataset,
                config,
                split,
                offset: String(offset),
                length: String(PAGE_SIZE),
            })
            const { buffer } = await downloadWithRetry(`${ROWS_API}?${search.toString()}`, this.http, this.deps)
            const page = JSON.parse(buffer.toString('utf8')) as RowsResponse
            total = page.num_rows_total
            for (const { row_idx, row } of page.rows) {
                const image = row[imageColumn] as ImageCell | undefined
                if (!image?.src) continue
                const text = row[textColumn]
                rows.push({
                    rowIndex: row_idx,
                    imageUrl: image.src,
                    width: image.width,
                    height: image.height,
                    text: typeof text === 'string' ? text : '',
                })
            }
            if (page.rows.length === 0) break
        }
        return rows
    }
}

/** Stable identity of a row, independent of the expiring image URL. */
export function huggingFaceRowId(dataset: string, split: string, rowIndex: number): string {
    return `https://huggingface.co/datasets/${dataset}/viewer/default/${split}?row=${rowIndex}`
}
