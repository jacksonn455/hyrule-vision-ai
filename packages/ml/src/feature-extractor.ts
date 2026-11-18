import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import tf from '@tensorflow/tfjs-node'

import { MODELS_DIR } from './paths.ts'
import { IMAGE_CHANNELS } from './preprocessing.ts'

/**
 * Transfer learning: MobileNet V2, already trained on ImageNet (1.4 million photos, 1000 classes), turns an image
 * into 1280 numbers that describe shapes, textures and colours. We do NOT retrain it: we only train a small
 * classifier on top of those numbers. It learned to "see" from far more images than we will ever collect, which is
 * why it beats a CNN trained from scratch on ~30 000 noisy images, and trains in minutes instead of hours.
 */
export const FEATURE_EXTRACTOR = {
    name: 'mobilenet_v2_100_224',
    url: 'https://tfhub.dev/google/tfjs-model/imagenet/mobilenet_v2_100_224/feature_vector/3/default/1',
    /** MobileNet was trained on 224×224 images with values in [0, 1]. */
    inputSize: 224,
    features: 1280,
} as const

/** Downloaded once from TF Hub, then loaded from disk (the API works offline). Git-ignored like every model. */
export const FEATURE_EXTRACTOR_DIR = path.join(MODELS_DIR, 'mobilenet-v2')

export async function loadFeatureExtractor(dir = FEATURE_EXTRACTOR_DIR): Promise<tf.GraphModel> {
    const modelJson = path.join(dir, 'model.json')
    const local = await access(modelJson).then(
        () => true,
        () => false,
    )
    if (!local) await download(dir)
    return tf.loadGraphModel(`file://${modelJson}`)
}

/**
 * Copies the original files (model.json + weight shards) from TF Hub. GraphModel.save() is not used: the weights
 * it writes for this model cannot be loaded back ("byte length of Float32Array should be a multiple of 4").
 */
async function download(dir: string) {
    console.log(`Downloading ${FEATURE_EXTRACTOR.name} from TF Hub (once)…`)
    const fetchFile = async (name: string) => {
        const response = await fetch(`${FEATURE_EXTRACTOR.url}/${name}?tfjs-format=file`)
        if (!response.ok) throw new Error(`TF Hub answered ${response.status} for ${name}`)
        return Buffer.from(await response.arrayBuffer())
    }
    const modelJson = await fetchFile('model.json')
    const manifest = JSON.parse(modelJson.toString('utf8')) as { weightsManifest: { paths: string[] }[] }
    const shards = manifest.weightsManifest.flatMap((group) => group.paths)
    const temp = `${dir}.download`
    await rm(temp, { recursive: true, force: true })
    await mkdir(temp, { recursive: true })
    for (const shard of shards) await writeFile(path.join(temp, shard), await fetchFile(shard))
    await writeFile(path.join(temp, 'model.json'), modelJson) // last: its presence means "download complete"
    await rm(dir, { recursive: true, force: true })
    await rename(temp, dir)
}

/** `count` images of RGB bytes (inputSize × inputSize × 3 each, one after another) → [count, 1280] features. */
export function extractFeatures(extractor: tf.GraphModel, pixels: Uint8Array, count: number): tf.Tensor2D {
    const size = FEATURE_EXTRACTOR.inputSize
    return tf.tidy(() => {
        const batch = tf.tensor4d(pixels, [count, size, size, IMAGE_CHANNELS], 'int32').toFloat().div(255)
        return extractor.predict(batch) as tf.Tensor2D
    })
}
