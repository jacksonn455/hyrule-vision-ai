/**
 * Builds the datasets of both models from data/raw (stratified, seeded, reproducible):
 *   data/dataset/characters/{train,validation,test}/{link,zelda,midna,…,other}
 *   data/dataset/games/{train,validation,test}/{breath-of-the-wild,wind-waker,…}
 * plus data/dataset/<task>/classes.json (the classes train.ts will use, in output-layer order).
 *
 * Classes are discovered from the folders (see dataset/classes.ts): a character or game folder becomes a class
 * once it has --min-images images. Images are copied unchanged; resizing happens when they are loaded.
 * Usage: npm run ml:split-dataset [-- --seed 42 --min-images 10]
 */
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { listImageFiles, toRepoPath } from '../collection/local-images.ts'
import { classesForTask } from '../dataset/classes.ts'
import { CLASSES_FILE } from '../dataset/load.ts'
import { stratifiedSplit } from '../dataset/split.ts'
import { DATASET_DIR, DATASET_SPLITS, RAW_DATA_DIR, TASKS, datasetClassDir, taskDatasetDir } from '../paths.ts'

const { values } = parseArgs({
    options: {
        seed: { type: 'string', default: '42' },
        'min-images': { type: 'string', default: '10' },
    },
})
const seed = Number(values.seed)
const minImages = Number(values['min-images'])

const rawPaths = (await listImageFiles(RAW_DATA_DIR)).map((file) => toRepoPath(file, RAW_DATA_DIR))

// Layout before per-task folders: data/dataset/{train,validation,test}. Removed so stale copies never linger.
for (const legacy of DATASET_SPLITS) await rm(path.join(DATASET_DIR, legacy), { recursive: true, force: true })
await rm(path.join(DATASET_DIR, 'split-manifest.json'), { force: true })

for (const task of TASKS) {
    const { images, classes } = classesForTask(task, rawPaths, minImages)
    const split = stratifiedSplit(images, seed)
    // Start from a clean folder so re-running never mixes two splits or keeps a class that was removed.
    await rm(taskDatasetDir(task), { recursive: true, force: true })

    const counts: Record<string, Record<string, number>> = {}
    for (const label of classes.labels) {
        counts[label] = {}
        for (const name of DATASET_SPLITS) {
            const dir = datasetClassDir(task, name, label)
            await mkdir(dir, { recursive: true })
            const items = split[name].filter((image) => image.label === label)
            for (const image of items) {
                // Prefix with the source folder so files with the same name in different folders never collide.
                const target = `${image.group.replaceAll('/', '__')}__${path.basename(image.relativePath)}`
                await copyFile(path.join(RAW_DATA_DIR, image.relativePath), path.join(dir, target))
            }
            counts[label][name] = items.length
        }
    }

    await writeFile(
        path.join(taskDatasetDir(task), CLASSES_FILE),
        `${JSON.stringify({ ...classes, seed, splitCounts: counts }, null, 2)}\n`,
    )
    console.log(`\n${task}: ${classes.labels.length} classes (min ${minImages} images each)`)
    console.table(counts)
    if (Object.keys(classes.belowThreshold).length > 0) {
        const verb = task === 'characters' ? 'merged into "other"' : 'skipped'
        console.log(`below ${minImages} images, ${verb}:`, classes.belowThreshold)
    }
}
