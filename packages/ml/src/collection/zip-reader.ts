import { inflateRawSync } from 'node:zlib'

export interface ZipEntry {
    name: string
    /** Decompresses the entry on demand, so only the entries we need cost memory. */
    read: () => Buffer
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const CENTRAL_FILE_HEADER = 0x02014b50
const LOCAL_FILE_HEADER = 0x04034b50
const STORED = 0
const DEFLATED = 8

/**
 * Minimal ZIP reader (stored and deflated entries, no ZIP64, no encryption): enough for dataset archives,
 * without adding a dependency. Entry names are returned as-is: never use them as file paths without sanitising.
 */
export function readZip(zip: Buffer, maxEntryBytes = 50 * 1024 * 1024): ZipEntry[] {
    let eocd = -1
    for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
        if (zip.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) {
            eocd = i
            break
        }
    }
    if (eocd === -1) throw new Error('not a ZIP archive (no end of central directory)')

    const count = zip.readUInt16LE(eocd + 10)
    let offset = zip.readUInt32LE(eocd + 16)
    const entries: ZipEntry[] = []
    for (let i = 0; i < count; i++) {
        if (zip.readUInt32LE(offset) !== CENTRAL_FILE_HEADER) throw new Error('corrupted ZIP central directory')
        const method = zip.readUInt16LE(offset + 10)
        const compressedSize = zip.readUInt32LE(offset + 20)
        const size = zip.readUInt32LE(offset + 24)
        const nameLength = zip.readUInt16LE(offset + 28)
        const extraLength = zip.readUInt16LE(offset + 30)
        const commentLength = zip.readUInt16LE(offset + 32)
        const localOffset = zip.readUInt32LE(offset + 42)
        const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength)
        offset += 46 + nameLength + extraLength + commentLength

        if (name.endsWith('/')) continue
        entries.push({
            name,
            read: () => {
                if (size > maxEntryBytes) throw new Error(`${name}: ${size} bytes exceeds ${maxEntryBytes}`)
                if (zip.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER) throw new Error(`${name}: bad local header`)
                const start = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28)
                const data = zip.subarray(start, start + compressedSize)
                if (method === STORED) return Buffer.from(data)
                if (method === DEFLATED) return inflateRawSync(data, { maxOutputLength: maxEntryBytes })
                throw new Error(`${name}: unsupported compression method ${method}`)
            },
        })
    }
    return entries
}
