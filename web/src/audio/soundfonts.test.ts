import { describe, expect, it } from 'vitest'
import {
  isTagRollSoundfontId,
  soundfontIsMultiInstrument,
  soundfontUrl,
  SPESSASYNTH_PROCESSOR_URL,
  TAG_ROLL_DEFAULT_SOUNDFONT_ID,
  TAG_ROLL_SOUNDFONT_OPTIONS,
} from './soundfonts'
import {
  clampSoundfontPatchToBank,
  normalizeSoundfontPatch,
  soundfontFavoriteKey,
  soundfontPresetsFor,
  TAG_ROLL_DEFAULT_SOUNDFONT_PATCH,
} from './soundfontPresets'
import { isPianoSoundEngineId, isSampledPianoEngine } from './pianoSamples'

describe('soundfonts catalog', () => {
  it('lists grand, upright, and Yamaha XG with public URLs', () => {
    expect(TAG_ROLL_SOUNDFONT_OPTIONS).toHaveLength(3)
    expect(isTagRollSoundfontId(TAG_ROLL_DEFAULT_SOUNDFONT_ID)).toBe(true)
    expect(soundfontUrl('ydp-grand')).toContain('YDP-GrandPiano.sf2')
    expect(soundfontUrl('upright-kw')).toContain('Upright-Piano-KW.sf2')
    expect(soundfontUrl('yamaha-xg')).toContain('Yamaha-XG.sf2')
    expect(soundfontIsMultiInstrument('yamaha-xg')).toBe(true)
    expect(soundfontIsMultiInstrument('ydp-grand')).toBe(false)
    expect(SPESSASYNTH_PROCESSOR_URL).toContain('spessasynth_processor.min.js')
    expect(SPESSASYNTH_PROCESSOR_URL).toContain('instruments/soundfonts/')
  })

  it('ships an XG preset catalog with unique patch keys', () => {
    const presets = soundfontPresetsFor('yamaha-xg')
    expect(presets.length).toBeGreaterThan(100)
    const keys = new Set(presets.map((p) => `${p.bankMSB}:${p.bankLSB}:${p.program}`))
    expect(keys.size).toBe(presets.length)
    expect(presets.some((p) => p.name.toLowerCase().includes('grand'))).toBe(true)
    expect(presets.some((p) => p.drum)).toBe(true)
  })

  it('clamps unknown patches to a valid bank preset', () => {
    expect(normalizeSoundfontPatch(null)).toEqual(TAG_ROLL_DEFAULT_SOUNDFONT_PATCH)
    expect(clampSoundfontPatchToBank('ydp-grand', { bankMSB: 9, bankLSB: 0, program: 4 })).toEqual(
      TAG_ROLL_DEFAULT_SOUNDFONT_PATCH,
    )
    const strings = clampSoundfontPatchToBank('yamaha-xg', {
      bankMSB: 0,
      bankLSB: 0,
      program: 48,
    })
    expect(strings).toEqual({ bankMSB: 0, bankLSB: 0, program: 48 })
    expect(soundfontFavoriteKey('yamaha-xg', strings)).toBe('yamaha-xg|0:0:48')
  })

  it('treats soundfont as a sampled piano engine id', () => {
    expect(isPianoSoundEngineId('soundfont')).toBe(true)
    expect(isSampledPianoEngine('soundfont')).toBe(true)
    expect(isSampledPianoEngine('synth')).toBe(false)
  })
})
