import { describe, expect, it } from 'vitest'
import { advanceBeatScope, beatScopePoint, centsBetweenHz } from './chordBeatScope'

describe('chordBeatScope', () => {
  it('computes cents between hz', () => {
    expect(centsBetweenHz(440, 440)).toBeCloseTo(0, 6)
    expect(centsBetweenHz(466.16, 440)!).toBeGreaterThan(90)
  })

  it('freezes relative phase when locked', () => {
    const a = advanceBeatScope(0.1, 0.2, 0.2, 1)
    expect(a.locked).toBe(true)
    expect(a.beatHz).toBe(0)
  })

  it('advances live faster when sharp', () => {
    const a = advanceBeatScope(0, 0, 20, 0.25)
    expect(a.locked).toBe(false)
    expect(a.beatHz).toBeGreaterThan(0)
    expect(a.livePhase01).toBeGreaterThan(a.refPhase01)
  })

  it('maps phases to unit circle axes', () => {
    const p = beatScopePoint(0, 0.25)
    expect(p.x).toBeCloseTo(0, 6)
    expect(p.y).toBeCloseTo(1, 6)
  })
})
