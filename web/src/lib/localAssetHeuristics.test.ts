import { describe, expect, it } from 'vitest'
import {
  defaultTrackLabel,
  guessPartIdFromFilename,
  guessSongTitleFromFilenames,
  songTitleFromFilename,
  uniqueTrackPartKey,
} from './localAssetHeuristics'

describe('localAssetHeuristics', () => {
  it('guesses part ids from common filename patterns', () => {
    expect(guessPartIdFromFilename('My Song - Full.mp3')).toBe('mix')
    expect(guessPartIdFromFilename('My Song - Lead.mp3')).toBe('lead')
    expect(guessPartIdFromFilename('My_Song_Tenor.m4a')).toBe('tenor')
    expect(guessPartIdFromFilename('Chart (Bari).wav')).toBe('bari')
    expect(guessPartIdFromFilename('bass.mp3')).toBe('bass')
    expect(guessPartIdFromFilename('Baritone Track.mp3')).toBe('bari')
    expect(guessPartIdFromFilename('All Parts.mp3')).toBe('mix')
    expect(guessPartIdFromFilename('Warmup.pdf')).toBeNull()
  })

  it('strips part tokens for song titles', () => {
    expect(songTitleFromFilename('Hello World - Lead.mp3')).toBe('Hello World')
    expect(songTitleFromFilename('Hello World (Full).mp3')).toBe('Hello World')
  })

  it('guesses a shared title from multiple files', () => {
    expect(
      guessSongTitleFromFilenames([
        'Goodnight Sweetheart - Lead.mp3',
        'Goodnight Sweetheart - Bass.mp3',
        'Goodnight Sweetheart.pdf',
      ]),
    ).toBe('Goodnight Sweetheart')
  })

  it('labels known parts with partLabel defaults', () => {
    expect(defaultTrackLabel('x - Lead.mp3', 'lead')).toBe('Lead')
    expect(defaultTrackLabel('Custom Solo.mp3', 'custom_solo')).toBe('Custom Solo')
  })

  it('dedupes track part keys', () => {
    const used = new Set<string>()
    expect(uniqueTrackPartKey('lead', 'Lead', used)).toBe('lead')
    expect(uniqueTrackPartKey('lead', 'Lead', used)).toBe('lead2')
    expect(uniqueTrackPartKey(null, 'Other Voice', used)).toBe('other_voice')
  })
})
