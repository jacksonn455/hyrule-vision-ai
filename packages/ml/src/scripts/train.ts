/**
 * Trains one CNN on data/dataset/<task>/train, monitors data/dataset/<task>/validation every epoch, keeps the epoch
 * with the lowest validation loss (early stopping), then measures it ONCE on data/dataset/<task>/test.
 * Output: models/hyrule-cnn[-games]/{model.json, weights.bin, labels.json, metrics.json}
 * Usage: npm run ml:train [-- --task characters|games --epochs 100 --batch-size 32 --patience 15 --no-augment]
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

import tf from '@tensorflow/tfjs-node'

import { augmentBatch } from '../augmentation.ts'
import { loadSplit, readTaskClasses } from '../dataset/load.ts'
import { LABELS_FILE, METRICS_FILE, type ModelMetricsFile } from '../model-files.ts'
import { classWeights, evaluate } from '../metrics.ts'
import { buildModel } from '../model.ts'
import { MODEL_DIRS, TASKS, type Task } from '../paths.ts'
import { IMAGE_SIZE } from '../preprocessing.ts'

const { values } = parseArgs({
    options: {
        task: { type: 'string', default: 'characters' },
        // Augmented images are harder, so learning is slower: more epochs and more patience than without it.
        epochs: { type: 'string', default: '100' },
        'batch-size': { type: 'string', default: '32' },
        patience: { type: 'string', default: '15' },
        'no-augment': { type: 'boolean', default: false },
    },
})
const task = values.task as Task
if (!TASKS.includes(task)) throw new Error(`--task must be one of: ${TASKS.join(', ')}`)
const augment = !values['no-augment']
const epochs = Number(values.epochs)
const patience = Number(values.patience)
const MODEL_DIR = MODEL_DIRS[task]

const classes = await readTaskClasses(task)
const { labels } = classes
if (labels.length < 2) throw new Error(`${task}: need at least 2 classes, found ${labels.join(', ') || 'none'}`)

// Start clean: a model.json from a previous run with a different number of classes must never be paired with
// the new labels.json. labels.json is written first, so the API always finds the labels of the saved weights.
await rm(MODEL_DIR, { recursive: true, force: true })
await mkdir(MODEL_DIR, { recursive: true })
await writeFile(path.join(MODEL_DIR, LABELS_FILE), `${JSON.stringify(labels, null, 2)}\n`)

console.log(`Task "${task}": ${labels.length} classes → ${labels.join(', ')}`)
console.log('Loading images…')
const [train, validation, test] = await Promise.all([
    loadSplit(task, 'train', labels),
    loadSplit(task, 'validation', labels),
    loadSplit(task, 'test', labels),
])
console.log(`train ${train.indices.length} | validation ${validation.indices.length} | test ${test.indices.length}`)

const model = buildModel(labels.length)
model.summary()

let bestValLoss = Infinity
let bestEpoch = 0
const history: ModelMetricsFile['history'] = []

const weights = classWeights(train.indices, labels.length)
const f = (v: number) => v.toFixed(3)

// One fit() call per epoch, so each epoch can train on a freshly augmented copy of the training images.
for (let epoch = 1; epoch <= epochs; epoch++) {
    const epochXs = augment ? augmentBatch(train.xs) : train.xs
    const { history: logs } = await model.fit(epochXs, train.ys, {
        epochs: 1,
        batchSize: Number(values['batch-size']),
        shuffle: true,
        validationData: [validation.xs, validation.ys],
        classWeight: weights,
        verbose: 0,
    })
    if (epochXs !== train.xs) epochXs.dispose()

    const value = (key: string) => Number(logs[key]![0])
    const row = { epoch, loss: value('loss'), acc: value('acc'), valLoss: value('val_loss'), valAcc: value('val_acc') }
    history.push(row)
    let note = ''
    // Keep only the best epoch on disk: later epochs usually overfit (train loss ↓, validation loss ↑).
    if (row.valLoss < bestValLoss) {
        bestValLoss = row.valLoss
        bestEpoch = epoch
        await model.save(`file://${MODEL_DIR}`)
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

// Evaluate the saved best model, not the last epoch's weights.
const best = await tf.loadLayersModel(`file://${MODEL_DIR}/model.json`)
const predicted = tf.tidy(() => (best.predict(test.xs) as tf.Tensor2D).argMax(1).arraySync() as number[])
const result = evaluate(test.indices, predicted, labels)

console.log(`\nBest epoch ${bestEpoch} (val_loss ${bestValLoss.toFixed(3)})`)
console.log(`Test accuracy: ${(result.accuracy * 100).toFixed(1)}%  (chance ≈ ${(100 / labels.length).toFixed(1)}%)`)
console.log('Confusion matrix (rows = actual, columns = predicted):')
console.table(
    Object.fromEntries(
        labels.map((a, i) => [a, Object.fromEntries(labels.map((p, j) => [p, result.confusionMatrix[i]![j]]))]),
    ),
)
console.table(result.perClass)

const trainCounts = Object.fromEntries(labels.map((l, i) => [l, train.indices.filter((x) => x === i).length]))
const metrics: ModelMetricsFile = {
    task,
    trainedAt: new Date().toISOString(),
    imageSize: IMAGE_SIZE,
    augment,
    labels,
    trainCounts,
    characters: classes.characters,
    bestEpoch,
    bestValLoss,
    test: result,
    history,
}
await writeFile(path.join(MODEL_DIR, METRICS_FILE), `${JSON.stringify(metrics, null, 2)}\n`)
tf.dispose([train.xs, train.ys, validation.xs, validation.ys, test.xs, test.ys])
