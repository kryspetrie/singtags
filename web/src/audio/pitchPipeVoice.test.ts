/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach } from 'vitest'
import {
  BRIGHT_PITCH_PIPE_VOICE,
  clearActivePitchPipeVoice,
  DEFAULT_PITCH_PIPE_VOICE,
  finalizePitchPipeVoiceForSave,
  formatPitchPipeVoiceExport,
  getActivePitchPipeVoice,
  getBuiltInPitchPipeVoice,
  hasCustomActivePitchPipeVoice,
  loadPitchPipeSoundId,
  loadPitchPipeVoiceLibrary,
  parsePitchPipeVoice,
  pitchPipeVoiceShareMailto,
  PITCH_PIPE_ACTIVE_VOICE_KEY,
  PITCH_PIPE_VOICE_LIBRARY_KEY,
  PITCH_PIPE_VOICE_SCHEMA,
  removePitchPipeVoiceFromLibrary,
  setActivePitchPipeVoice,
  slugifyPitchPipeVoiceLabel,
  upsertPitchPipeVoiceLibrary,
} from './pitchPipeVoice'

describe('pitchPipeVoice', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips the mellow default', () => {
    const json = formatPitchPipeVoiceExport(DEFAULT_PITCH_PIPE_VOICE)
    const parsed = parsePitchPipeVoice(JSON.parse(json))
    expect(parsed).toEqual({
      ...DEFAULT_PITCH_PIPE_VOICE,
      notes: DEFAULT_PITCH_PIPE_VOICE.notes,
    })
    expect(parsed?.schema).toBe(PITCH_PIPE_VOICE_SCHEMA)
    expect(parsed?.id).toBe('mellow')
  })

  it('exposes bright built-in as square + sine', () => {
    expect(BRIGHT_PITCH_PIPE_VOICE.partials.map((p) => p.type)).toEqual(['square', 'sine'])
    expect(getBuiltInPitchPipeVoice('bright').id).toBe('bright')
  })

  it('reads preferred built-in sound from pitch-pipe prefs localStorage', () => {
    expect(loadPitchPipeSoundId()).toBe('mellow')
    expect(getActivePitchPipeVoice().id).toBe('mellow')
    localStorage.setItem(
      'singtags.pitchPipe.v1',
      JSON.stringify({
        range: 'e3-e4',
        layout: 'grid',
        aHz: 440,
        detuneCents: 0,
        showOctave: false,
        sound: 'bright',
      }),
    )
    expect(loadPitchPipeSoundId()).toBe('bright')
    expect(getActivePitchPipeVoice().partials[0]?.type).toBe('square')
  })

  it('parses a lab export with filter and extra partial', () => {
    const parsed = parsePitchPipeVoice({
      id: 'bright-reed',
      label: 'Bright reed',
      notes: 'try this',
      masterGain: 0.28,
      attackSec: 0.04,
      releaseSec: 0.8,
      partials: [
        { type: 'sawtooth', gain: 0.45, semitones: 0, detuneCents: 3 },
        { type: 'triangle', gain: 0.2, semitones: 12 },
      ],
      filter: { type: 'lowpass', frequencyHz: 3200, Q: 1.1 },
    })
    expect(parsed).toMatchObject({
      schema: PITCH_PIPE_VOICE_SCHEMA,
      id: 'bright-reed',
      label: 'Bright reed',
      filter: { type: 'lowpass', frequencyHz: 3200, Q: 1.1 },
      partials: [
        { type: 'sawtooth', gain: 0.45, semitones: 0, detuneCents: 3 },
        { type: 'triangle', gain: 0.2, semitones: 12, detuneCents: 0 },
      ],
    })
  })

  it('rejects empty or invalid partials', () => {
    expect(parsePitchPipeVoice({ partials: [] })).toBeNull()
    expect(parsePitchPipeVoice({ partials: [{ type: 'nope', gain: 1 }] })).toBeNull()
  })

  it('slugifies labels and finalizes saves without a manual id', () => {
    expect(slugifyPitchPipeVoiceLabel('Warm Reed!!')).toBe('warm-reed')
    const saved = finalizePitchPipeVoiceForSave({
      ...DEFAULT_PITCH_PIPE_VOICE,
      id: 'stale',
      label: 'Warm Reed',
    })
    expect(saved.id).toBe('warm-reed')
  })

  it('persists active voice for pitch pipe / pay-the-key', () => {
    expect(hasCustomActivePitchPipeVoice()).toBe(false)
    expect(getActivePitchPipeVoice().id).toBe(DEFAULT_PITCH_PIPE_VOICE.id)
    setActivePitchPipeVoice({
      ...DEFAULT_PITCH_PIPE_VOICE,
      id: 'custom',
      label: 'Custom',
      masterGain: 0.22,
    })
    expect(hasCustomActivePitchPipeVoice()).toBe(true)
    expect(getActivePitchPipeVoice().masterGain).toBe(0.22)
    expect(JSON.parse(localStorage.getItem(PITCH_PIPE_ACTIVE_VOICE_KEY)!).label).toBe('Custom')
    clearActivePitchPipeVoice()
    expect(hasCustomActivePitchPipeVoice()).toBe(false)
    expect(getActivePitchPipeVoice().id).toBe(DEFAULT_PITCH_PIPE_VOICE.id)
  })

  it('upserts and removes lab library voices', () => {
    expect(loadPitchPipeVoiceLibrary()).toEqual([])
    upsertPitchPipeVoiceLibrary({
      ...DEFAULT_PITCH_PIPE_VOICE,
      id: 'a',
      label: 'Alpha',
    })
    upsertPitchPipeVoiceLibrary({
      ...DEFAULT_PITCH_PIPE_VOICE,
      id: 'b',
      label: 'Beta',
    })
    expect(loadPitchPipeVoiceLibrary().map((v) => v.id)).toEqual(['b', 'a'])
    expect(JSON.parse(localStorage.getItem(PITCH_PIPE_VOICE_LIBRARY_KEY)!)).toHaveLength(2)
    removePitchPipeVoiceFromLibrary('b')
    expect(loadPitchPipeVoiceLibrary().map((v) => v.id)).toEqual(['a'])
  })

  it('builds a mailto link for sharing with Krys', () => {
    const href = pitchPipeVoiceShareMailto({
      ...DEFAULT_PITCH_PIPE_VOICE,
      label: 'Warm reed',
    })
    expect(href.startsWith('mailto:info@singtags.com?')).toBe(true)
    expect(href).toContain(encodeURIComponent('Warm reed'))
    expect(href).toContain(encodeURIComponent(PITCH_PIPE_VOICE_SCHEMA))
  })
})
