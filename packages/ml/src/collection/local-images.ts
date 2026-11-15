import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import type { DuplicateIndex } from './duplicate-index.ts'
import { perceptualHash, sha256 } from './hashing.ts'
import { hasAllowedExtension } from './image-validator.ts'

/** Every image file under `dir` (recursively), as absolute paths. */
export async function listImageFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => [])
    return entries
        .filter((entry) => entry.isFile() && hasAllowedExtension(entry.name))
        .map((entry) => path.join(entry.parentPath, entry.name))
        .sort()
}

export function toRepoPath(file: string, repoRoot: string): string {
    return path.relative(repoRoot, file).split(path.sep).join('/')
}

/**
 * Adds images that are already on disk to the duplicate index, including ones added by hand that have no
 * metadata, so the collector never downloads a second copy of them. Unreadable files are reported, not fatal.
 */
export async function indexLocalImages(
    dir: string,
    index: DuplicateIndex,
    repoRoot: string,
): Promise<{ indexed: number; unreadable: string[] }> {
    const unreadable: string[] = []
    let indexed = 0
    for (const file of await listImageFiles(dir)) {
        try {
            const buffer = await readFile(file)
            index.add({
                sha256: sha256(buffer),
                perceptualHash: await perceptualHash(buffer),
                ref: toRepoPath(file, repoRoot),
            })
            indexed++
        } catch {
            unreadable.push(toRepoPath(file, repoRoot))
        }
    }
    return { indexed, unreadable }
}
