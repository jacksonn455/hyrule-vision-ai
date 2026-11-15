import tf from '@tensorflow/tfjs-node'

/**
 * Data augmentation: every epoch the network sees a slightly different version of each training image, so it
 * cannot memorise the ~470 originals and has to learn what stays the same (the character) instead.
 * Only plausible changes are used: a mirrored Link is still Link; an upside-down one would never be uploaded.
 * - horizontal flip (50%)
 * - random zoom/crop to 80–100% of the image, at a random position
 * - brightness ±15%
 * Applied to TRAINING images only: validation and test must stay untouched to measure real performance.
 */
export function augmentBatch(xs: tf.Tensor4D, random: () => number = Math.random): tf.Tensor4D {
    return tf.tidy(() => {
        const [n, height, width] = xs.shape
        const flipMask = tf.tensor1d(Array.from({ length: n }, () => (random() < 0.5 ? 1 : 0))).reshape([n, 1, 1, 1])
        const flipped = tf.image
            .flipLeftRight(xs)
            .mul(flipMask)
            .add(xs.mul(tf.scalar(1).sub(flipMask)))

        const boxes = Array.from({ length: n }, () => {
            const scale = 0.8 + random() * 0.2
            const top = random() * (1 - scale)
            const left = random() * (1 - scale)
            return [top, left, top + scale, left + scale]
        })
        const boxIndices = Array.from({ length: n }, (_, i) => i)
        const cropped = tf.image.cropAndResize(flipped as tf.Tensor4D, boxes, boxIndices, [height, width])

        const brightness = tf.tensor1d(Array.from({ length: n }, () => (random() - 0.5) * 0.3)).reshape([n, 1, 1, 1])
        return cropped.add(brightness).clipByValue(0, 1) as tf.Tensor4D
    })
}
