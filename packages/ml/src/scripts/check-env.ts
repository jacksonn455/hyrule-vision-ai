/**
 * Verifies that the native ML dependencies work on this machine before we rely on them:
 * - @tensorflow/tfjs-node binds to the native TensorFlow C library (much faster than pure JS),
 *   which is the part most likely to break on install (wrong platform binary, missing DLL).
 * - sharp binds to libvips, used to decode and resize images.
 */
import tf from '@tensorflow/tfjs-node'
import sharp from 'sharp'

await tf.ready()
console.log(`TensorFlow.js ${tf.version.tfjs} | backend: ${tf.getBackend()}`)

// One 3x3 convolution over a tiny 8x8 RGB "image": the core operation of a CNN.
const image = tf.ones([1, 8, 8, 3])
const kernels = tf.ones([3, 3, 3, 4])
const featureMaps = tf.conv2d(image as tf.Tensor4D, kernels as tf.Tensor4D, 1, 'same')
console.log(`conv2d ${JSON.stringify(image.shape)} -> ${JSON.stringify(featureMaps.shape)}`)
tf.dispose([image, kernels, featureMaps])

const { width, height, channels } = await sharp({
    create: { width: 4, height: 4, channels: 3, background: '#00ff00' },
})
    .png()
    .toBuffer()
    .then((buffer) => sharp(buffer).metadata())
console.log(`sharp ${sharp.versions.sharp} | libvips ${sharp.versions.vips} | decoded ${width}x${height}x${channels}`)

console.log('ML environment OK')
