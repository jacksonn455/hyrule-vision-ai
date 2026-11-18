/**
 * Transfer learning: MobileNet V2 (pre-trained on ImageNet) describes every image with 1280 numbers, and a small
 * classifier learns our classes from those numbers. Same dataset, splits, output folder and metrics as train.ts,
 * so the API and the web page work unchanged; the API runs MobileNet before the classifier (see classifier.ts).
 *   npm run ml:train:transfer [-- --task characters|games --epochs 200 --patience 15]
 * The first run extracts the features (minutes); later runs read them from data/cache/features (seconds).
 */
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

import tf from '@tensorflow/tfjs-node'

import { loadFeatures } from '../dataset/features.ts'
import { readTaskClasses } from '../dataset/load.ts'
import { FEATURE_EXTRACTOR, loadFeatureExtractor } from '../feature-extractor.ts'
import { classWeights, evaluate } from '../metrics.ts'
import { LABELS_FILE, METRICS_FILE, type ModelMetricsFile } from '../model-files.ts'
import { MODEL_DIRS, TASKS, type Task } from '../paths.ts'

const { values } = parseArgs({
    options: {
        task: { type: 'string', default: 'characters' },
        epochs: { type: 'string', default: '200' },
        'batch-size': { type: 'string', default: '64' },
        patience: { type: 'string', default: '15' },
        /**
         * How much rare classes are boosted in the loss. balanced: every class counts the same (good recall for
         * small characters, but the big ones — Link, Zelda — get under-predicted). sqrt: half-way. none: as-is.
         */
        weights: { type: 'string', default: 'sqrt' },
        /** Write the model somewhere else (e.g. to compare settings without replacing the API's model). */
        out: { type: 'string' },
    },
})
const WEIGHT_MODES = ['balanced', 'sqrt', 'none'] as const
const weightMode = values.weights as (typeof WEIGHT_MODES)[number]
if (!WEIGHT_MODES.includes(weightMode)) throw new Error(`--weights must be one of: ${WEIGHT_MODES.join(', ')}`)
const task = values.task as Task
if (!TASKS.includes(task)) throw new Error(`--task must be one of: ${TASKS.join(', ')}`)
const MODEL_DIR = values.out ? path.resolve(values.out) : MODEL_DIRS[task]
const WORK_DIR = `${MODEL_DIR}.training`

const classes = await readTaskClasses(task)
const { labels } = classes
if (labels.length < 2) throw new Error(`${task}: need at least 2 classes, found ${labels.join(', ') || 'none'}`)
console.log(`Task "${task}": ${labels.length} classes → ${labels.join(', ')}`)

const extractor = await loadFeatureExtractor()
const train = await loadFeatures(task, 'train', labels, extractor)
const validation = await loadFeatures(task, 'validation', labels, extractor)
const test = await loadFeatures(task, 'test', labels, extractor)
extractor.dispose()
console.log(`train ${train.indices.length} | validation ${validation.indices.length} | test ${test.indices.length}`)

const toTensors = (split: typeof train) => ({
    xs: tf.tensor2d(split.features, [split.indices.length, FEATURE_EXTRACTOR.features]),
    ys: tf.tidy(() => tf.oneHot(tf.tensor1d(split.indices, 'int32'), labels.length).toFloat() as tf.Tensor2D),
})
const trainData = toTensors(train)
const validationData = toTensors(validation)
const testData = toTensors(test)

/** The only part we train: 1280 features → 256 → classes, with dropout so it cannot memorise the noisy images. */
const model = tf.sequential({
    layers: [
        tf.layers.dropout({ inputShape: [FEATURE_EXTRACTOR.features], rate: 0.2 }),
        tf.layers.dense({ units: 256, activation: 'relu', kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }) }),
        tf.layers.dropout({ rate: 0.5 }),
        tf.layers.dense({ units: labels.length, activation: 'softmax' }),
    ],
})
model.compile({ optimizer: tf.train.adam(0.001), loss: 'categoricalCrossentropy', metrics: ['accuracy'] })
model.summary()

await rm(WORK_DIR, { recursive: true, force: true })
await mkdir(WORK_DIR, { recursive: true })
await writeFile(path.join(WORK_DIR, LABELS_FILE), `${JSON.stringify(labels, null, 2)}\n`)

const balanced = classWeights(train.indices, labels.length)
const weights =
    weightMode === 'none'
        ? undefined
        : weightMode === 'sqrt'
          ? Object.fromEntries(Object.entries(balanced).map(([k, w]) => [k, Math.sqrt(w)]))
          : balanced
console.log(`Class weights: ${weightMode}`)
const patience = Number(values.patience)
const history: ModelMetricsFile['history'] = []
let bestValLoss = Infinity
let bestEpoch = 0
const f = (v: number) => v.toFixed(3)

for (let epoch = 1; epoch <= Number(values.epochs); epoch++) {
    const { history: logs } = await model.fit(trainData.xs, trainData.ys, {
        epochs: 1,
        batchSize: Number(values['batch-size']),
        shuffle: true,
        validationData: [validationData.xs, validationData.ys],
        classWeight: weights,
        verbose: 0,
    })
    const value = (key: string) => Number(logs[key]![0])
    const row = { epoch, loss: value('loss'), acc: value('acc'), valLoss: value('val_loss'), valAcc: value('val_acc') }
    history.push(row)
    let note = ''
    if (row.valLoss < bestValLoss) {
        bestValLoss = row.valLoss
        bestEpoch = epoch
        await model.save(`file://${WORK_DIR}`)
        note = '  ← best, saved'
    }
    console.log(
        `epoch ${String(epoch).padStart(3)} | loss ${f(row.loss)} acc ${f(row.acc)} | val_loss ${f(row.valLoss)} val_acc ${f(row.valAcc)}${note}`,
    )
    if (epoch - bestEpoch >= patience) {
        console.log(`No improvement for ${patience} epochs: stopping.`)
        break
    }
}

const best = await tf.loadLayersModel(`file://${WORK_DIR}/model.json`)
const predicted = tf.tidy(() => (best.predict(testData.xs) as tf.Tensor2D).argMax(1).arraySync() as number[])
const result = evaluate(test.indices, predicted, labels)

console.log(`\nBest epoch ${bestEpoch} (val_loss ${bestValLoss.toFixed(3)})`)
console.log(`Test accuracy: ${(result.accuracy * 100).toFixed(1)}%  (chance ≈ ${(100 / labels.length).toFixed(1)}%)`)
console.table(result.perClass)

const metrics: ModelMetricsFile = {
    task,
    featureExtractor: FEATURE_EXTRACTOR.name,
    trainedAt: new Date().toISOString(),
    imageSize: FEATURE_EXTRACTOR.inputSize,
    augment: false,
    labels,
    trainCounts: Object.fromEntries(labels.map((l, i) => [l, train.indices.filter((x) => x === i).length])),
    characters: classes.characters,
    bestEpoch,
    bestValLoss,
    test: result,
    history,
}
await writeFile(path.join(WORK_DIR, METRICS_FILE), `${JSON.stringify(metrics, null, 2)}\n`)
tf.dispose([trainData.xs, trainData.ys, validationData.xs, validationData.ys, testData.xs, testData.ys])

// Swap in the new model only now that it is complete.
await rm(MODEL_DIR, { recursive: true, force: true })
await rename(WORK_DIR, MODEL_DIR)
console.log(`Saved to ${MODEL_DIR}`)
