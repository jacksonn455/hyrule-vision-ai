import sharp from 'sharp'

export interface SpriteBox {
    x: number
    y: number
    width: number
    height: number
}

export interface ExtractOptions {
    /** Smaller boxes are effects, particles or text glyphs, not characters. */
    minSize: number
    /** Pixels of empty space that still count as "the same sprite" (e.g. a sword drawn apart from the body). */
    gap: number
    /** Alpha (0-255) below which a pixel counts as transparent. */
    alphaThreshold: number
    /** Max per-channel difference to the background colour, for sheets with a solid background. */
    colorTolerance: number
}

export const DEFAULT_EXTRACT_OPTIONS: ExtractOptions = { minSize: 12, gap: 2, alphaThreshold: 16, colorTolerance: 8 }

function overlaps(a: SpriteBox, b: SpriteBox, gap: number): boolean {
    return (
        a.x - gap <= b.x + b.width &&
        b.x - gap <= a.x + a.width &&
        a.y - gap <= b.y + b.height &&
        b.y - gap <= a.y + a.height
    )
}

function union(a: SpriteBox, b: SpriteBox): SpriteBox {
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    return {
        x,
        y,
        width: Math.max(a.x + a.width, b.x + b.width) - x,
        height: Math.max(a.y + a.height, b.y + b.height) - y,
    }
}

/**
 * Finds the individual sprites on a sheet: pixels that differ from the background (transparent, or the colour of
 * the top-left pixel) are grouped into connected regions, regions closer than `gap` are merged, and tiny regions
 * are dropped. Returns boxes in reading order (top to bottom, left to right).
 */
export async function findSprites(
    sheet: Buffer,
    options: ExtractOptions = DEFAULT_EXTRACT_OPTIONS,
): Promise<SpriteBox[]> {
    const { data, info } = await sharp(sheet).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const { width, height } = info
    const bg = [data[0]!, data[1]!, data[2]!, data[3]!] as const
    const transparentBackground = bg[3] < options.alphaThreshold
    const isForeground = (i: number): boolean => {
        const alpha = data[i * 4 + 3]!
        if (alpha < options.alphaThreshold) return false
        if (transparentBackground) return true
        return [0, 1, 2].some((c) => Math.abs(data[i * 4 + c]! - bg[c]!) > options.colorTolerance)
    }

    // Connected components (8-neighbourhood) with an explicit stack: no recursion limits on big sprites.
    const visited = new Uint8Array(width * height)
    let boxes: SpriteBox[] = []
    const stack: number[] = []
    for (let start = 0; start < width * height; start++) {
        if (visited[start] || !isForeground(start)) continue
        let minX = width
        let minY = height
        let maxX = 0
        let maxY = 0
        visited[start] = 1
        stack.push(start)
        while (stack.length > 0) {
            const p = stack.pop()!
            const px = p % width
            const py = (p - px) / width
            minX = Math.min(minX, px)
            maxX = Math.max(maxX, px)
            minY = Math.min(minY, py)
            maxY = Math.max(maxY, py)
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = px + dx
                    const ny = py + dy
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
                    const n = ny * width + nx
                    if (!visited[n] && isForeground(n)) {
                        visited[n] = 1
                        stack.push(n)
                    }
                }
            }
        }
        boxes.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    }

    // Merge parts of the same sprite (until nothing changes: a merge can create a new overlap).
    for (let merged = true; merged;) {
        merged = false
        const next: SpriteBox[] = []
        for (const box of boxes) {
            const target = next.find((other) => overlaps(other, box, options.gap))
            if (target) {
                Object.assign(target, union(target, box))
                merged = true
            } else next.push({ ...box })
        }
        boxes = next
    }

    return boxes
        .filter((box) => box.width >= options.minSize && box.height >= options.minSize)
        .sort((a, b) => a.y - b.y || a.x - b.x)
}

/**
 * Cuts one sprite out as PNG (transparency preserved). Pixel art is tiny (16-64 px), below the dataset's minimum
 * size, so it is enlarged by a whole factor with nearest-neighbour sampling: every original pixel becomes an
 * exact block, no new colours are invented.
 */
export async function cutSprite(sheet: Buffer, box: SpriteBox, minSide: number): Promise<Buffer> {
    const factor = Math.min(16, Math.max(1, Math.ceil(minSide / Math.min(box.width, box.height))))
    return sharp(sheet)
        .extract({ left: box.x, top: box.y, width: box.width, height: box.height })
        .resize(box.width * factor, box.height * factor, { kernel: 'nearest' })
        .png()
        .toBuffer()
}
