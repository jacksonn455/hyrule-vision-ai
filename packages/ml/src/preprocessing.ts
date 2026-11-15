import sharp from 'sharp'

/**
 * Every image becomes a square IMAGE_SIZE x IMAGE_SIZE RGB image before reaching the network.
 * A CNN has a fixed input shape, so training AND the API must use exactly this same pipeline;
 * that is why it lives in one place. 96px keeps enough detail (hair, hat, ears) while staying fast on CPU.
 */
export const IMAGE_SIZE = 96
export const IMAGE_CHANNELS = 3

/**
 * decode → fix EXIF rotation → resize (letterbox, nothing is cropped) → drop alpha → raw RGB bytes (0..255).
 * `contain` keeps the whole character visible; the padding is black.
 * Returns IMAGE_SIZE * IMAGE_SIZE * 3 bytes in row-major [height][width][channel] order, as TensorFlow expects.
 */
export async function imageToPixels(input: Buffer | string): Promise<Uint8Array> {
    const { data } = await sharp(input, { failOn: 'error' })
        .rotate()
        .resize(IMAGE_SIZE, IMAGE_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0 } })
        .removeAlpha()
        .toColourspace('srgb')
        .raw()
        .toBuffer({ resolveWithObject: true })
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}
