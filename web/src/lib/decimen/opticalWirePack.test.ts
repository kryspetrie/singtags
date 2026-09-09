/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { packOpticalFile, unpackOpticalFile } from './opticalWirePack'

describe('opticalWirePack', () => {
  it('round-trips compressible text via XZ and yields plain bytes', async () => {
    const raw = new TextEncoder().encode('SingTags optical '.repeat(400))
    const packed = await packOpticalFile('note.txt', 'text/plain', raw)
    expect(packed.transmittedSize).toBeLessThan(raw.length)
    expect(packed.container[4]).toBe(2) // xz
    const file = await unpackOpticalFile(packed.container)
    expect(file.name).toBe('note.txt')
    expect(file.type).toBe('text/plain')
    expect(Array.from(file.bytes)).toEqual(Array.from(raw))
  })

  it('skips XZ for tiny payloads', async () => {
    const raw = new TextEncoder().encode('hi')
    const packed = await packOpticalFile('tiny.txt', 'text/plain', raw)
    expect(packed.container[4]).not.toBe(2)
    const file = await unpackOpticalFile(packed.container)
    expect(Array.from(file.bytes)).toEqual(Array.from(raw))
  })
})
