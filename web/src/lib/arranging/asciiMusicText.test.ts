import { describe, expect, it } from 'vitest'
import { asciiMusicText } from './asciiMusicText'

describe('asciiMusicText', () => {
  it('normalizes cadences and flats for Latin-only fonts', () => {
    expect(asciiMusicText('V7→I, ♭II7→I · lock')).toBe('V7->I, bII7->I | lock')
  })
})
