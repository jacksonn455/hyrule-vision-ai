/**
 * Trains one CNN on data/dataset/<task>/train, monitors data/dataset/<task>/validation every epoch, keeps the epoch
 * with the lowest validation loss (early stopping), then measures it ONCE on data/dataset/<task>/test.
 * Output: models/hyrule-cnn[-games]/{model.json, weights.bin, labels.json, metrics.json}
 * Usage: npm run ml:train [-- --task characters|games --epochs 100 --batch-size 32 --patience 15 --no-augment]
 *
 * Tens of thousands of images do not fit in memory as floats, so the images are kept as bytes and fed to the
 * network a chunk (a few thousand images) at a time. The model is trained in a temporary folder and only replaces
 * the previous one at the end: a failed or interrupted run leaves the API's current model untouched.
 */
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

import tf from '@tensorflow/tfjs-node'

import { augmentBatch } from '../augmentation.ts'
import type { LoadedSplit } from '../dataset/load.ts'
import { chunks, loadSplit, readTaskClasses, toTensors } from '../dataset/load.ts'
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
const batchSize = Number(values['batch-size'])
/** Images turned into float tensors at once: 2048 × 96 × 96 × 3 × 4 bytes ≈ 226 MB. */
const CHUNK_SIZE = 2048
const MODEL_DIR = MODEL_DIRS[task]
const WORK_DIR = `${MODEL_DIR}.training`

const classes = await readTaskClasses(task)
const { labels } = classes
if (labels.length < 2) throw new Error(`${task}: need at least 2 classes, found ${labels.join(', ') || 'none'}`)

// labels.json is written first, so model.json is never next to labels of another run.
await rm(WORK_DIR, { recursive: true, force: true })
await mkdir(WORK_DIR, { recursive: true })
await writeFile(path.join(WORK_DIR, LABELS_FILE), `${JSON.stringify(labels, null, 2)}\n`)

console.log(`Task "${task}": ${labels.length} classes → ${labels.join(', ')}`)
console.log('Loading images…')
const train = await loadSplit(task, 'train', labels)
const validation = await loadSplit(task, 'validation', labels)
const test = await loadSplit(task, 'test', labels)
console.log(`train ${train.indices.length} | validation ${validation.indices.length} | test ${test.indices.length}`)

const model = buildModel(labels.length)
model.summary()

const range = (n: number) => Array.from({ length: n }, (_, i) => i)
function shuffled(n: number): number[] {
    const order = range(n)
    for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[order[i], order[j]] = [order[j]!, order[i]!]
    }
    return order
}

/** Loss and accuracy on a whole split, chunk by chunk (no training). */
async function measure(split: LoadedSplit): Promise<{ loss: number; acc: number }> {
    let loss = 0
    let acc = 0
    for (const positions of chunks(range(split.indices.length), CHUNK_SIZE)) {
        const { xs, ys } = toTensors(split, positions)
        const [l, a] = model.evaluate(xs, ys, { batchSize: 256 }) as tf.Scalar[]
        loss += (await l!.data())[0]! * positions.length
        acc += (await a!.data())[0]! * positions.length
        tf.dispose([xs, ys, l!, a!])
    }
    return { loss: loss / split.indices.length, acc: acc / split.indices.length }
}

/** Predicted class of every image of a split. */
function predictAll(net: tf.LayersModel, split: LoadedSplit): number[] {
    const predicted: number[] = []
    for (const positions of chunks(range(split.indices.length), CHUNK_SIZE)) {
        const { xs, ys } = toTensors(split, positions)
        predicted.push(
            ...tf.tidy(() => (net.predict(xs, { batchSize: 256 }) as tf.Tensor2D).argMax(1).arraySync() as number[]),
        )
        tf.dispose([xs, ys])
    }
    return predicted
}

let bestValLoss = Infinity
let bestEpoch = 0
const history: ModelMetricsFile['history'] = []

const weights = classWeights(train.indices, labels.length)
const f = (v: number) => v.toFixed(3)

for (let epoch = 1; epoch <= epochs; epoch++) {
    // A fresh random order every epoch; each chunk gets a freshly augmented copy of its images.
    let loss = 0
    let acc = 0
    for (const positions of chunks(shuffled(train.indices.length), CHUNK_SIZE)) {
        const { xs, ys } = toTensors(train, positions)
        const input = augment ? augmentBatch(xs) : xs
        const { history: logs } = await model.fit(input, ys, {
            epochs: 1,
            batchSize,
            shuffle: true,
            classWeight: weights,
            verbose: 0,
        })
        loss += Number(logs.loss![0]) * positions.length
        acc += Number(logs.acc![0]) * positions.length
        tf.dispose(input === xs ? [xs, ys] : [xs, ys, input])
    }
    const val = await measure(validation)
    const row = {
        epoch,
        loss: loss / train.indices.length,
        acc: acc / train.indices.length,
        valLoss: val.loss,
        valAcc: val.acc,
    }
    history.push(row)
    let note = ''
    // Keep only the best epoch on disk: later epochs usually overfit (train loss ↓, validation loss ↑).
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

// Evaluate the saved best model, not the last epoch's weights.
const best = await tf.loadLayersModel(`file://${WORK_DIR}/model.json`)
const result = evaluate(test.indices, predictAll(best, test), labels)

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
await writeFile(path.join(WORK_DIR, METRICS_FILE), `${JSON.stringify(metrics, null, 2)}\n`)

// Swap in the new model only now that it is complete.
await rm(MODEL_DIR, { recursive: true, force: true })
await rename(WORK_DIR, MODEL_DIR)
console.log(`Saved to ${MODEL_DIR}`)
