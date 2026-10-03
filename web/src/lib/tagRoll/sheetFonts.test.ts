import { describe, expect, it } from 'vitest'
import {
  normalizeSheetMusicFont,
  normalizeSheetTextFont,
  vexMusicFontName,
  vexTextFontName,
} from './sheetFonts'

describe('sheetFonts', () => {
  it('normalizes unknown font ids to defaults', () => {
    expect(normalizeSheetMusicFont('nope')).toBe('bravura')
    expect(normalizeSheetTextFont(undefined)).toBe('academico')
  })

  it('maps ids to VexFlow font names', () => {
    expect(vexMusicFontName('petaluma')).toBe('Petaluma')
    expect(vexTextFontName('leland-text')).toBe('Leland Text')
  })
})
