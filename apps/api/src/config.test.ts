import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { loadConfig, loadEnvFile } from './config.ts'

describe('loadEnvFile', () => {
    afterEach(() => {
        delete process.env.HYRULE_TEST_VAR
    })

    it('does nothing (and does not throw) when the file is missing', () => {
        expect(loadEnvFile(path.join(tmpdir(), 'hyrule-missing', '.env'))).toBe(false)
    })

    it('loads variables when the file exists', () => {
        const file = path.join(mkdtempSync(path.join(tmpdir(), 'hyrule-env-')), '.env')
        writeFileSync(file, 'HYRULE_TEST_VAR=hello\n')
        expect(loadEnvFile(file)).toBe(true)
        expect(process.env.HYRULE_TEST_VAR).toBe('hello')
    })
})

describe('loadConfig', () => {
    it('defaults to 127.0.0.1:3333, the address the Vite proxy uses', () => {
        expect(loadConfig({})).toMatchObject({ host: '127.0.0.1', port: 3333 })
    })

    it('rejects an invalid PORT', () => {
        expect(() => loadConfig({ PORT: 'abc' })).toThrow('Invalid PORT')
    })
})
