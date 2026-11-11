import { describe, expect, it } from 'vitest'
import { analyzeGlanceStatus, chordGlanceStatus, tuneGlanceStatus } from './glanceStatus'
import type { ChordStackScore } from './chordStack'

function score(partial: Partial<ChordStackScore>): ChordStackScore {
  return {
    natureId: 'seventh',
    rootPc: 0,
    selfLocked: false,
    keyCentered: false,
    commonShiftCents: 0,
    unstable: false,
    status: 'wait',
    tones: [],
    assistedPinRequired: false,
    ...partial,
  }
}

describe('glanceStatus', () => {
  it('maps tune cents to room words', () => {
    expect(tuneGlanceStatus(null, false).word).toBe('WAIT')
    expect(tuneGlanceStatus(2, true).word).toBe('IN TUNE')
    expect(tuneGlanceStatus(18, false).word).toBe('SHARP')
    expect(tuneGlanceStatus(-12, false).word).toBe('FLAT')
  })

  it('maps chord score to wash + key mark', () => {
    expect(chordGlanceStatus(null).word).toBe('WAIT')
    expect(chordGlanceStatus(score({ assistedPinRequired: true })).word).toBe('WAIT')
    expect(chordGlanceStatus(score({ status: 'locked', selfLocked: true, keyCentered: true })).wash).toBe(
      'good',
    )
    const shifted = chordGlanceStatus(
      score({ status: 'shifted', selfLocked: true, commonShiftCents: 14 }),
    )
    expect(shifted.word).toBe('LOCKED')
    expect(shifted.wash).toBe('shifted')
    expect(shifted.keyMark).toBe('▲')
    expect(chordGlanceStatus(score({ status: 'fix' })).word).toBe('FIX')
  })

  it('maps analyze FFT/Spec to shared wash words', () => {
    expect(analyzeGlanceStatus({ paused: true, hasSignal: true }).word).toBe('PAUSED')
    expect(analyzeGlanceStatus({ paused: false, hasSignal: false }).word).toBe('WAIT')
    expect(
      analyzeGlanceStatus({ paused: false, hasSignal: true, heldOrStrong: true, detail: '2 tracks' }),
    ).toEqual({ kind: 'held', word: 'HELD', wash: 'good', detail: '2 tracks' })
    expect(analyzeGlanceStatus({ paused: false, hasSignal: true }).word).toBe('LIVE')
  })
})
