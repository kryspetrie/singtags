import { describe, expect, it } from 'vitest'
import {
  assertDecodableAudioBytes,
  isNonAudioPayload,
  sniffAudioMagic,
} from './audioBytes'

describe('audioBytes', () => {
  it('sniffs common containers', () => {
    expect(sniffAudioMagic(new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0]))).toBe('ogg')
    expect(sniffAudioMagic(new Uint8Array([0x49, 0x44, 0x33, 0, 0, 0, 0, 0]))).toBe('mpeg')
    expect(sniffAudioMagic(new TextEncoder().encode('MThdxxxx'))).toBe('midi')
    expect(
      sniffAudioMagic(new Uint8Array([0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11])),
    ).toBe('asf')
    expect(sniffAudioMagic(new TextEncoder().encode('XXXX'))).toBe('unknown')
  })

  it('flags HTML and JSON as non-audio', () => {
    expect(isNonAudioPayload(new TextEncoder().encode('<!DOCTYPE html><html>'))).toBe(true)
    expect(isNonAudioPayload(new TextEncoder().encode('{"tag_id":1}'))).toBe(true)
    expect(isNonAudioPayload(new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(
      false,
    )
  })

  it('assertDecodableAudioBytes throws before decode for documents', () => {
    expect(() => assertDecodableAudioBytes(new TextEncoder().encode('<html></html>'))).toThrow(
      /HTML/,
    )
    expect(() => assertDecodableAudioBytes(new TextEncoder().encode('{"a":1}'))).toThrow(/JSON/)
    expect(() => assertDecodableAudioBytes(new Uint8Array(0))).toThrow(/empty/)
  })

  it('assertDecodableAudioBytes rejects MIDI and ASF/WMA', () => {
    expect(() => assertDecodableAudioBytes(new TextEncoder().encode('MThd\0\0\0\0'))).toThrow(/MIDI/)
    expect(() =>
      assertDecodableAudioBytes(new Uint8Array([0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11])),
    ).toThrow(/WMA\/ASF/)
  })
})
