import { describe, expect, it } from 'vitest'
import {
  musicXmlSyllabicName,
  parseLyricSyllable,
} from './sheetLyricSyllabic'

describe('sheetLyricSyllabic', () => {
  it('marks trailing hyphen as begin and strips it for display', () => {
    const p = parseLyricSyllable('Love-', false)
    expect(p).toEqual({ text: 'Love', syllabic: 'begin', extendAfter: true })
  })

  it('continues a hyphenated word as middle then end', () => {
    const a = parseLyricSyllable('Beau-', false)
    expect(a!.syllabic).toBe('begin')
    const b = parseLyricSyllable('ti-', true)
    expect(b).toEqual({ text: 'ti', syllabic: 'middle', extendAfter: true })
    const c = parseLyricSyllable('ful', true)
    expect(c).toEqual({ text: 'ful', syllabic: 'end', extendAfter: false })
  })

  it('treats underscore as extender-only', () => {
    const p = parseLyricSyllable('_', true)
    expect(p).toEqual({ text: '', syllabic: 'extend', extendAfter: true })
    expect(musicXmlSyllabicName('extend')).toBeNull()
  })

  it('maps single syllables', () => {
    expect(parseLyricSyllable('Hey', false)).toEqual({
      text: 'Hey',
      syllabic: 'single',
      extendAfter: false,
    })
  })
})
