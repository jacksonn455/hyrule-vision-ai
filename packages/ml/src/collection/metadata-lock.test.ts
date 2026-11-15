import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { acquireMetadataLock } from './metadata-lock.ts'

describe('acquireMetadataLock', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'hyrule-lock-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('refuses a second writer while the first one is running, and frees the lock on release', async () => {
        const release = await acquireMetadataLock(dir)
        // The test runner itself is a live process that is not us.
        await writeFile(path.join(dir, '.lock'), String(process.ppid))

        await expect(acquireMetadataLock(dir)).rejects.toThrow(/is running/)

        await release()
        await expect(acquireMetadataLock(dir)).resolves.toBeTypeOf('function')
    })

    it('takes over a lock left by a process that no longer exists', async () => {
        await writeFile(path.join(dir, '.lock'), '999999999')

        await acquireMetadataLock(dir)

        expect(await readFile(path.join(dir, '.lock'), 'utf8')).toBe(String(process.pid))
    })
})
