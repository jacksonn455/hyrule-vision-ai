import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { CommonsFile, WikimediaCommonsClient } from './wikimedia-commons.ts'

export interface CatalogRoot {
    category: string
    /** How many levels of sub-categories to follow. */
    depth: number
}

interface CatalogFile {
    description: string
    fetchedAt: string
    roots: CatalogRoot[]
    files: CommonsFile[]
}

/**
 * Metadata (not images) of every Commons file under the given categories, cached on disk.
 * Listing categories costs dozens of API calls; caching keeps re-runs fast and polite.
 * Pass `refresh` to query Commons again (e.g. to pick up newly uploaded photos).
 */
export async function loadCommonsCatalog(
    client: WikimediaCommonsClient,
    roots: readonly CatalogRoot[],
    cacheFile: string,
    options: { refresh?: boolean; log?: (message: string) => void } = {},
): Promise<CommonsFile[]> {
    const { refresh = false, log = () => {} } = options
    if (!refresh) {
        try {
            const cached = JSON.parse(await readFile(cacheFile, 'utf8')) as CatalogFile
            if (JSON.stringify(cached.roots) === JSON.stringify(roots)) return cached.files
            log('catalog roots changed: refreshing')
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
    }

    const titles = new Set<string>()
    const visited = new Set<string>()
    for (const root of roots) {
        log(`listing ${root.category} (depth ${root.depth})`)
        for (const title of await client.listFilesInCategory(root.category, root.depth, visited)) titles.add(title)
    }
    log(`fetching metadata of ${titles.size} files`)
    const files = await client.getFiles([...titles].sort())

    await mkdir(path.dirname(cacheFile), { recursive: true })
    const catalog: CatalogFile = {
        description: 'Cached Wikimedia Commons metadata used to plan the dataset collection. Safe to delete.',
        fetchedAt: new Date().toISOString(),
        roots: [...roots],
        files,
    }
    await writeFile(cacheFile, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
    return files
}
