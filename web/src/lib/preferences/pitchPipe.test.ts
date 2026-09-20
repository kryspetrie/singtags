/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyPitchPipePrefsSnapshot,
  clampDetuneCents,
  defaultPitchPipePrefs,
  loadPitchPipePrefs,
  parsePitchPipePrefs,
  pitchPipePrefsSnapshot,
  savePitchPipePrefs,
} from './pitchPipe'
import { PITCH_PIPE_LAYOUT_KEY, PITCH_PIPE_PREFS_KEY, PITCH_PIPE_RANGE_KEY } from './keys'

describe('pitchPipe preferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns sensible defaults', () => {
    expect(defaultPitchPipePrefs()).toEqual({
      range: 'e3-e4',
      layout: 'grid',
      aHz: 440,
      detuneCents: 0,
      showOctave: false,
      sound: 'mellow',
      gridScale: 100,
      showFullKeyboard: false,
      pianoDefaultOctave: 4,
      pianoEngine: 'synth',
      pianoLockPosition: false,
      showPcKeyRange: true,
    })
    expect(loadPitchPipePrefs()).toEqual(defaultPitchPipePrefs())
  })

  it('clamps detune cents to ±50', () => {
    expect(clampDetuneCents(100)).toBe(50)
    expect(clampDetuneCents(-100)).toBe(-50)
    expect(clampDetuneCents(7.4)).toBe(7)
    expect(clampDetuneCents(NaN)).toBe(0)
  })

  it('parses detuneCents format with nullable concert A', () => {
    const parsed = parsePitchPipePrefs({
      range: 'e3-e4',
      layout: 'piano',
      aHz: null,
      detuneCents: -7,
      showOctave: true,
      sound: 'bright',
      gridScale: 90,
      showFullKeyboard: true,
      pianoDefaultOctave: 3,
      pianoEngine: 'samples',
      pianoLockPosition: true,
      showPcKeyRange: false,
    })
    expect(parsed).toEqual({
      range: 'e3-e4',
      layout: 'piano',
      aHz: null,
      detuneCents: -7,
      showOctave: true,
      sound: 'bright',
      gridScale: 90,
      showFullKeyboard: true,
      pianoDefaultOctave: 3,
      pianoEngine: 'samples',
      pianoLockPosition: true,
      showPcKeyRange: false,
    })
  })

  it('migrates legacy fineCents-on-top-of-A format', () => {
    const parsed = parsePitchPipePrefs({
      range: 'e3-e4',
      layout: 'grid',
      aHz: 432,
      fineCents: 0,
    })
    expect(parsed?.aHz).toBe(432)
    expect(parsed?.detuneCents).toBe(-32)
  })

  it('rejects invalid pitch pipe payloads', () => {
    expect(parsePitchPipePrefs(null)).toBeNull()
    expect(parsePitchPipePrefs({ range: 'bad', layout: 'grid' })).toBeNull()
    expect(parsePitchPipePrefs({ range: 'e3-e4', layout: 'nope' })).toBeNull()
  })

  it('loads from localStorage and migrates legacy split keys', () => {
    localStorage.setItem(PITCH_PIPE_RANGE_KEY, 'e3-e4')
    localStorage.setItem(PITCH_PIPE_LAYOUT_KEY, 'list')
    const prefs = loadPitchPipePrefs()
    expect(prefs.range).toBe('e3-e4')
    expect(prefs.layout).toBe('list')
  })

  it('persists and removes deprecated keys on save', () => {
    const prefs = defaultPitchPipePrefs()
    prefs.layout = 'list'
    savePitchPipePrefs(prefs)
    expect(JSON.parse(localStorage.getItem(PITCH_PIPE_PREFS_KEY)!)).toMatchObject({
      layout: 'list',
    })
    localStorage.setItem(PITCH_PIPE_RANGE_KEY, 'e3-e4')
    localStorage.setItem(PITCH_PIPE_LAYOUT_KEY, 'grid')
    savePitchPipePrefs(prefs)
    expect(localStorage.getItem(PITCH_PIPE_RANGE_KEY)).toBeNull()
    expect(localStorage.getItem(PITCH_PIPE_LAYOUT_KEY)).toBeNull()
  })

  it('round-trips offline cache snapshots', () => {
    const snapshot = { ...defaultPitchPipePrefs(), detuneCents: 3, aHz: null }
    expect(applyPitchPipePrefsSnapshot(snapshot)).toBe(true)
    expect(pitchPipePrefsSnapshot()).toMatchObject({ detuneCents: 3, aHz: null })
    expect(applyPitchPipePrefsSnapshot({ bad: true })).toBe(false)
  })
})
