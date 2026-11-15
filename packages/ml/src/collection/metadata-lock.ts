import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const LOCK_FILENAME = '.lock'

function isRunning(pid: number): boolean {
    try {
        process.kill(pid, 0)
        return true
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'EPERM'
    }
}

/**
 * Only one script may write data/metadata at a time (collector, manual import, review): two processes saving
 * sources.json would silently drop each other's records. A lock left by a crashed process is taken over.
 * Returns the function that releases the lock.
 */
export async function acquireMetadataLock(dir: string, pid = process.pid): Promise<() => Promise<void>> {
    const file = path.join(dir, LOCK_FILENAME)
    try {
        await writeFile(file, String(pid), { flag: 'wx' })
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        const owner = Number(await readFile(file, 'utf8').catch(() => 'NaN'))
        if (Number.isInteger(owner) && owner !== pid && isRunning(owner)) {
            throw new Error(`another collection/import (pid ${owner}) is running; wait for it to finish`, {
                cause: error,
            })
        }
        await writeFile(file, String(pid))
    }
    return () => rm(file, { force: true })
}
