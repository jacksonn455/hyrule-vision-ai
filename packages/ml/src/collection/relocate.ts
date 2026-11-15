import { access, mkdir, rename } from 'node:fs/promises'
import path from 'node:path'

import { toRepoPath } from './local-images.ts'
import type { MetadataStore } from './metadata-store.ts'
import type { RawSubcategory } from './taxonomy.ts'
import { rawSubcategoryDir } from './taxonomy.ts'

/**
 * Moves an image to another sub-folder of its class (data/raw/<label>/<subcategory>/) and updates its record, so the
 * file and sources.json never disagree. The filename's "<label>-<subcategory>-" prefix follows the new folder.
 * Refuses to overwrite a file already at the destination.
 */
export async function relocateImage(
    store: MetadataStore,
    imagePath: string,
    subcategory: RawSubcategory,
    rawDir: string,
    repoRoot: string,
): Promise<string> {
    const image = store.findImage(imagePath)
    if (!image) throw new Error(`not in sources.json: ${imagePath}`)
    const oldPrefix = `${image.label}-${image.subcategory}-`
    const filename = image.filename.startsWith(oldPrefix)
        ? `${image.label}-${subcategory}-${image.filename.slice(oldPrefix.length)}`
        : image.filename
    const dir = rawSubcategoryDir(image.label, subcategory, rawDir)
    const target = path.join(dir, filename)
    const exists = await access(target).then(
        () => true,
        () => false,
    )
    if (exists) throw new Error(`destination already exists: ${toRepoPath(target, repoRoot)}`)

    await mkdir(dir, { recursive: true })
    await rename(path.join(repoRoot, image.path), target)
    const newPath = toRepoPath(target, repoRoot)
    store.updateImage(imagePath, { subcategory, filename, path: newPath })
    return newPath
}
