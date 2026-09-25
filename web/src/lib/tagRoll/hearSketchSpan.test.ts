/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { resolveSketchHearMidis } from './hearSketchSpan'

describe('resolveSketchHearMidis', () => {
  it('returns four midis for an isolated chord', () => {
    const midis = resolveSketchHearMidis({
      startTick: 0,
      rootPc: 0,
      quality: 'major',
      leadMidi: 60,
      mode: 'oneshot',
    })
    expect(midis).toHaveLength(4)
    expect(midis.every((m) => Number.isFinite(m))).toBe(true)
  })

  it('path-optimizes oneshot across a sequence', () => {
    const seq = [
      { startTick: 0, rootPc: 7, quality: 'seventh', leadMidi: 67 },
      { startTick: 480, rootPc: 0, quality: 'major', leadMidi: 60 },
    ]
    const a = resolveSketchHearMidis({
      startTick: 0,
      rootPc: 7,
      quality: 'seventh',
      leadMidi: 67,
      mode: 'oneshot',
      sequence: seq,
      tonality: 0,
    })
    const b = resolveSketchHearMidis({
      startTick: 480,
      rootPc: 0,
      quality: 'major',
      leadMidi: 60,
      mode: 'oneshot',
      sequence: seq,
      tonality: 0,
    })
    expect(a).toHaveLength(4)
    expect(b).toHaveLength(4)
  })

  it('hold uses draft chord with neighbor context', () => {
    const seq = [
      { startTick: 0, rootPc: 7, quality: 'seventh', leadMidi: 67 },
      { startTick: 480, rootPc: 0, quality: 'major', leadMidi: 60 },
    ]
    const midis = resolveSketchHearMidis({
      startTick: 0,
      rootPc: 2,
      quality: 'm7',
      leadMidi: 62,
      mode: 'hold',
      sequence: seq,
      tonality: 0,
    })
    expect(midis).toHaveLength(4)
  })
})
