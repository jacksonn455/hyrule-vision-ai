/**
 * Builds data/dataset/{train,validation,test}/{link,zelda,other} from data/raw (stratified, seeded, reproducible).
 * Images are copied unchanged; resizing/normalisation happens when they are loaded (see preprocessing.ts).
 * Usage: npm run ml:split-dataset [-- --seed 42]
 */
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { CLASS_LABELS } from '@hyrule/shared'

import { listImageFiles, toRepoPath } from '../collection/local-images.ts'
import { labelFromRawPath, stratifiedSplit } from '../dataset/split.ts'
import { DATASET_DIR, DATASET_SPLITS, RAW_DATA_DIR, datasetClassDir } from '../paths.ts'

const { values } = parseArgs({ options: { seed: { type: 'string', default: '42' } } })
const seed = Number(values.seed)

const images = (await listImageFiles(RAW_DATA_DIR)).map((file) => labelFromRawPath(toRepoPath(file, RAW_DATA_DIR)))
const split = stratifiedSplit(images, seed)

const manifest: Record<string, Record<string, number>> = {}
for (const name of DATASET_SPLITS) {
    manifest[name] = {}
    for (const label of CLASS_LABELS) {
        const dir = datasetClassDir(name, label)
        await mkdir(dir, { recursive: true })
        // Start from a clean folder (keep .gitkeep) so re-running never mixes two splits.
        for (const entry of await readdir(dir)) if (entry !== '.gitkeep') await rm(path.join(dir, entry))
        const items = split[name].filter((image) => image.label === label)
        for (const image of items) {
            // Prefix with the source folder so files with the same name in different folders never collide.
            const target = `${image.group.replaceAll('/', '__')}__${path.basename(image.relativePath)}`
            await copyFile(path.join(RAW_DATA_DIR, image.relativePath), path.join(dir, target))
        }
        manifest[name][label] = items.length
    }
}

await writeFile(
    path.join(DATASET_DIR, 'split-manifest.json'),
    `${JSON.stringify({ seed, counts: manifest }, null, 2)}\n`,
)
console.table(manifest)
