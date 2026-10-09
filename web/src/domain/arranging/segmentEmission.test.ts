import { describe, expect, it } from 'vitest'
import { proposeRootForStrongNote } from './proposeStrongRoots'
import { segmentChordToneFit } from './segmentEmission'
import type { MelodyEvent } from './types'

describe('segmentEmission', () => {
  it('prefers I when ^5 Strong is followed by tonic chord tones', () => {
    const ppq = 480
    // C major: G (^5) then C E — span fits I better than V alone.
    const melody: MelodyEvent[] = [
      { id: 'g', midi: 67, startTick: 0, durationTicks: ppq, role: 'pmn' },
      { id: 'c', midi: 60, startTick: ppq, durationTicks: ppq / 2, role: 'smn' },
      { id: 'e', midi: 64, startTick: ppq + ppq / 2, durationTicks: ppq / 2, role: 'smn' },
    ]
    const fitI = segmentChordToneFit({
      melody,
      startTick: 0,
      endTick: 2 * ppq,
      tonality: 0,
      homeDeg: 0,
    })
    const fitV = segmentChordToneFit({
      melody,
      startTick: 0,
      endTick: 2 * ppq,
      tonality: 0,
      homeDeg: 7,
    })
    expect(fitI).toBeGreaterThan(fitV)

    const prop = proposeRootForStrongNote({
      note: melody[0]!,
      melody,
      tonality: 0,
      mode: 'major',
      prevRootPc: 0,
      segmentEndTick: 2 * ppq,
      ppq,
    })
    expect(prop.homeDeg).toBe(0)
  })

  it('prefers II over IV when ^6 span has II chord tones', () => {
    const ppq = 480
    // A (^6) then D F# — II7 tones in C; base may prefer IV.
    const melody: MelodyEvent[] = [
      { id: 'a', midi: 69, startTick: 0, durationTicks: ppq, role: 'pmn' },
      { id: 'd', midi: 62, startTick: ppq, durationTicks: ppq / 2, role: 'smn' },
      { id: 'fs', midi: 66, startTick: ppq + ppq / 2, durationTicks: ppq / 2, role: 'smn' },
    ]
    const prop = proposeRootForStrongNote({
      note: melody[0]!,
      melody,
      tonality: 0,
      mode: 'major',
      prevRootPc: 0,
      segmentEndTick: 2 * ppq,
      ppq,
    })
    expect(prop.homeDeg).toBe(2)
  })

  it('prefers V when ^5 Strong span stays on dominant tones', () => {
    const ppq = 480
    // G then D F — V7 tones, not tonic.
    const melody: MelodyEvent[] = [
      { id: 'g', midi: 67, startTick: 0, durationTicks: ppq, role: 'pmn' },
      { id: 'd', midi: 62, startTick: ppq, durationTicks: ppq / 2, role: 'smn' },
      { id: 'f', midi: 65, startTick: ppq + ppq / 2, durationTicks: ppq / 2, role: 'smn' },
    ]
    const fitI = segmentChordToneFit({
      melody,
      startTick: 0,
      endTick: 2 * ppq,
      tonality: 0,
      homeDeg: 0,
    })
    const fitV = segmentChordToneFit({
      melody,
      startTick: 0,
      endTick: 2 * ppq,
      tonality: 0,
      homeDeg: 7,
    })
    expect(fitV).toBeGreaterThan(fitI)

    const prop = proposeRootForStrongNote({
      note: melody[0]!,
      melody,
      tonality: 0,
      mode: 'major',
      prevRootPc: 0,
      segmentEndTick: 2 * ppq,
      ppq,
    })
    expect(prop.homeDeg).toBe(7)
  })
})
