/**
 * Trains the CNN on data/dataset/train, monitors data/dataset/validation every epoch, keeps the epoch with the
 * lowest validation loss (early stopping), then measures it ONCE on data/dataset/test.
 * Output: models/hyrule-cnn/{model.json, weights.bin, metrics.json}
 * Usage: npm run ml:train [-- --epochs 100 --batch-size 32 --patience 15 --no-augment]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

import tf from '@tensorflow/tfjs-node'

import { CLASS_LABELS } from '@hyrule/shared'

import { augmentBatch } from '../augmentation.ts'
import { loadSplit } from '../dataset/load.ts'
import { classWeights, evaluate } from '../metrics.ts'
import { buildModel } from '../model.ts'
import { MODELS_DIR } from '../paths.ts'
import { IMAGE_SIZE } from '../preprocessing.ts'

const { values } = parseArgs({
    options: {
        // Augmented images are harder, so learning is slower: more epochs and more patience than without it.
        epochs: { type: 'string', default: '100' },
        'batch-size': { type: 'string', default: '32' },
        patience: { type: 'string', default: '15' },
        'no-augment': { type: 'boolean', default: false },
    },
})
const augment = !values['no-augment']
const epochs = Number(values.epochs)
const patience = Number(values.patience)
const MODEL_DIR = path.join(MODELS_DIR, 'hyrule-cnn')
await mkdir(MODEL_DIR, { recursive: true })

console.log('Loading images…')
const [train, validation, test] = await Promise.all([loadSplit('train'), loadSplit('validation'), loadSplit('test')])
console.log(`train ${train.labels.length} | validation ${validation.labels.length} | test ${test.labels.length}`)

const model = buildModel()
model.summary()

const trainIndices = train.labels.map((l) => CLASS_LABELS.indexOf(l))
let bestValLoss = Infinity
let bestEpoch = 0
const history: { epoch: number; loss: number; acc: number; valLoss: number; valAcc: number }[] = []

const weights = classWeights(trainIndices)
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
const result = evaluate(
    test.labels.map((l) => CLASS_LABELS.indexOf(l)),
    predicted,
)

console.log(`\nBest epoch ${bestEpoch} (val_loss ${bestValLoss.toFixed(3)})`)
console.log(
    `Test accuracy: ${(result.accuracy * 100).toFixed(1)}%  (chance ≈ ${(100 / CLASS_LABELS.length).toFixed(1)}%)`,
)
console.log('Confusion matrix (rows = actual, columns = predicted):')
console.table(
    Object.fromEntries(
        CLASS_LABELS.map((a, i) => [
            a,
            Object.fromEntries(CLASS_LABELS.map((p, j) => [p, result.confusionMatrix[i]![j]])),
        ]),
    ),
)
console.table(result.perClass)

await writeFile(
    path.join(MODEL_DIR, 'metrics.json'),
    `${JSON.stringify({ trainedAt: new Date().toISOString(), imageSize: IMAGE_SIZE, augment, labels: CLASS_LABELS, bestEpoch, bestValLoss, test: result, history }, null, 2)}\n`,
)
tf.dispose([train.xs, train.ys, validation.xs, validation.ys, test.xs, test.ys])
