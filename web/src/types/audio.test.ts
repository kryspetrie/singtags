import { describe, expect, it } from 'vitest'
import {
  IDENTITY_TRANSFORM,
  aacBitrate,
  downloadFormatLabel,
  encodeQualityForDownload,
  isIdentityTransform,
  mp3VbrQuality,
  normalizeDownloadFormat,
  transformFilenameSuffix,
  transformFromMode,
} from '../types/audio'

describe('AudioTransform helpers', () => {
  it('detects identity', () => {
    expect(isIdentityTransform(IDENTITY_TRANSFORM)).toBe(true)
    expect(isIdentityTransform({ pitchSemitones: 0, speed: 1 })).toBe(true)
    expect(isIdentityTransform({ pitchSemitones: 2, speed: 1 })).toBe(false)
  })

  it('builds modes from current playback', () => {
    const current = { pitchSemitones: 2, speed: 0.95 }
    expect(transformFromMode('original', current)).toEqual(IDENTITY_TRANSFORM)
    expect(transformFromMode('key', current)).toEqual({ pitchSemitones: 2, speed: 1 })
    expect(transformFromMode('speed', current)).toEqual({ pitchSemitones: 0, speed: 0.95 })
    expect(transformFromMode('key+speed', current)).toEqual(current)
  })

  it('suffixes filenames', () => {
    expect(transformFilenameSuffix(IDENTITY_TRANSFORM)).toBe('')
    expect(transformFilenameSuffix({ pitchSemitones: 2, speed: 1 })).toBe('_+2st')
    expect(transformFilenameSuffix({ pitchSemitones: -1, speed: 0.95 })).toBe('_-1st_95pct')
  })

  it('maps encode qualities to AAC bitrates and MP3 VBR', () => {
    expect(aacBitrate('standard')).toBe(96_000)
    expect(aacBitrate('compact')).toBe(64_000)
    expect(aacBitrate('lofi')).toBe(32_000)
    expect(mp3VbrQuality('standard')).toBe(2)
    expect(mp3VbrQuality('lofi')).toBe(7)
  })

  it('labels download formats and maps encode quality', () => {
    expect(downloadFormatLabel('m4a')).toBe('Original (M4A)')
    expect(downloadFormatLabel('mp3')).toBe('MP3 (VBR q2)')
    expect(encodeQualityForDownload('m4a')).toBe('original')
    expect(encodeQualityForDownload('mp3')).toBe('standard')
    expect(normalizeDownloadFormat(undefined)).toBe('m4a')
    expect(normalizeDownloadFormat('ogg')).toBe('m4a')
  })
})
