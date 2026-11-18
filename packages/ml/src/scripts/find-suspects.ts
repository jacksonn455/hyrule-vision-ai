/**
 * Finds probably-mislabelled images in data/raw (web searches bring fan art, cosplay, group pictures, other
 * characters) and moves them out of the dataset, to data/review/suspects/<task>/<label>-as-<predicted>/.
 *
 * How: k-fold "out-of-fold" predictions. The images are split in k parts; for each part a fresh classifier is
 * trained on the other parts (MobileNet features, see transfer-head.ts), then predicts the part it never saw.
 * An image whose folder says "paya" but that this unbiased model calls "link" with ≥ 90% confidence is a suspect.
 * Nothing is deleted: look at the folders, move back what is fine, then `npm run ml:sync-metadata`.
 *
 *   npm run ml:find-suspects [-- --task characters|games --threshold 0.9 --folds 5 --dry-run]
 */
import { mkdir, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

import tf from '@tensorflow/tfjs-node'

import { OTHER_LABEL } from '@hyrule/shared'

import { hasAllowedExtension } from '../collection/image-validator.ts'
import { classesForTask } from '../dataset/classes.ts'
import { FeatureStore, featuresOf } from '../dataset/features.ts'
import { readTaskClasses } from '../dataset/load.ts'
import { seededRandom } from '../dataset/split.ts'
import { FEATURE_EXTRACTOR, loadFeatureExtractor } from '../feature-extractor.ts'
import { DATA_DIR, RAW_DATA_DIR, TASKS, type Task } from '../paths.ts'
import { buildTransferHead, featureTensors, weightsFor } from '../transfer-head.ts'

const { values } = parseArgs({
    options: {
        task: { type: 'string', default: 'characters' },
        threshold: { type: 'string', default: '0.9' },
        folds: { type: 'string', default: '5' },
        epochs: { type: 'string', default: '20' },
        'dry-run': { type: 'boolean', default: false },
    },
})
const task = values.task as Task
if (!TASKS.includes(task)) throw new Error(`--task must be one of: ${TASKS.join(', ')}`)
const threshold = Number(values.threshold)
const folds = Number(values.folds)
const REVIEW_DIR = path.join(DATA_DIR, 'review', 'suspects', task)

// Same classes as the current split (same min-images rule).
const { minImages, labels } = await readTaskClasses(task)
const entries = await readdir(RAW_DATA_DIR, { recursive: true, withFileTypes: true })
const relativePaths = entries
    .filter((e) => e.isFile() && hasAllowedExtension(e.name))
    .map((e) => path.relative(RAW_DATA_DIR, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
const { images } = classesForTask(task, relativePaths, minImages)
const labelled = images
    .filter((i) => labels.includes(i.label))
    .map((i) => ({ file: path.join(RAW_DATA_DIR, i.relativePath), index: labels.indexOf(i.label) }))
console.log(`${task}: ${labelled.length} images, ${labels.length} classes, ${folds} folds`)

let extractor: tf.GraphModel | undefined
const store = await FeatureStore.open()
const all = await featuresOf(store, labelled, async () => (extractor ??= await loadFeatureExtractor()))
extractor?.dispose()

const random = seededRandom(42)
const foldOf = all.indices.map(() => Math.floor(random() * folds))
const dim = FEATURE_EXTRACTOR.features
const pick = (positions: number[]) => {
    const features = new Float32Array(positions.length * dim)
    positions.forEach((p, i) => features.set(all.features.subarray(p * dim, (p + 1) * dim), i * dim))
    return featureTensors(
        features,
        positions.map((p) => all.indices[p]!),
        labels.length,
    )
}

/** Out-of-fold probabilities: every image is scored by a model that did not train on it. */
const predicted = new Array<{ label: number; probability: number }>(all.indices.length)
for (let fold = 0; fold < folds; fold++) {
    const trainPositions = foldOf.flatMap((f, p) => (f === fold ? [] : [p]))
    const heldOut = foldOf.flatMap((f, p) => (f === fold ? [p] : []))
    const trainData = pick(trainPositions)
    const model = buildTransferHead(labels.length)
    await model.fit(trainData.xs, trainData.ys, {
        epochs: Number(values.epochs),
        batchSize: 64,
        shuffle: true,
        classWeight: weightsFor(
            'sqrt',
            trainPositions.map((p) => all.indices[p]!),
            labels.length,
        ),
        verbose: 0,
    })
    const heldOutData = pick(heldOut)
    const probabilities = tf.tidy(() => (model.predict(heldOutData.xs) as tf.Tensor2D).arraySync())
    heldOut.forEach((p, i) => {
        const row = probabilities[i]!
        const label = row.indexOf(Math.max(...row))
        predicted[p] = { label, probability: row[label]! }
    })
    tf.dispose([trainData.xs, trainData.ys, heldOutData.xs, heldOutData.ys])
    model.dispose()
    console.log(`fold ${fold + 1}/${folds} done`)
}

const otherIndex = labels.indexOf(OTHER_LABEL)
const suspects = all.files
    .map((file, p) => ({ file, actual: all.indices[p]!, ...predicted[p]! }))
    .filter((s) => s.actual !== otherIndex && s.label !== s.actual && s.probability >= threshold)

const perClass = Object.fromEntries(
    labels.map((label, i) => [
        label,
        { images: all.indices.filter((x) => x === i).length, suspects: suspects.filter((s) => s.actual === i).length },
    ]),
)
console.table(perClass)
console.log(`${suspects.length} suspects (≥ ${threshold * 100}% sure it is another class)`)

if (!values['dry-run']) {
    for (const s of suspects) {
        const target = path.join(REVIEW_DIR, `${labels[s.actual]}-as-${labels[s.label]}`, path.basename(s.file))
        await mkdir(path.dirname(target), { recursive: true })
        await rename(s.file, target)
    }
    await writeFile(
        path.join(REVIEW_DIR, 'report.json'),
        `${JSON.stringify(
            {
                createdAt: new Date().toISOString(),
                threshold,
                folds,
                perClass,
                suspects: suspects.map((s) => ({
                    from: path.relative(DATA_DIR, s.file).split(path.sep).join('/'),
                    actual: labels[s.actual],
                    predicted: labels[s.label],
                    probability: Number(s.probability.toFixed(3)),
                })),
            },
            null,
            2,
        )}\n`,
    )
    console.log(
        `Moved to ${path.relative(DATA_DIR, REVIEW_DIR)}. Next: npm run ml:sync-metadata && npm run ml:train:all`,
    )
}
