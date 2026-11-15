import { describe, expect, it } from 'vitest'

import { buildStoredZip } from './test-fixtures.ts'
import { readZip } from './zip-reader.ts'

describe('readZip', () => {
    it.each([false, true])('reads entries (deflated: %s)', (deflate) => {
        const zip = buildStoredZip({ 'a.txt': Buffer.from('hello'), 'b/c.json': Buffer.from('{"x":1}') }, deflate)

        const entries = readZip(zip)

        expect(entries.map((e) => [e.name, e.read().toString()])).toEqual([
            ['a.txt', 'hello'],
            ['b/c.json', '{"x":1}'],
        ])
    })

    it('rejects data that is not a ZIP archive', () => {
        expect(() => readZip(Buffer.from('<html>not a zip</html>'))).toThrow(/not a ZIP/)
    })

    it('refuses entries above the size limit', () => {
        const [entry] = readZip(buildStoredZip({ 'big.bin': Buffer.alloc(100) }), 10)

        expect(() => entry!.read()).toThrow(/exceeds/)
    })
})
