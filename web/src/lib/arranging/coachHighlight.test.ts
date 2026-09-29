import { describe, expect, it } from 'vitest'
import {
  clearCoachHighlight,
  getCoachHighlight,
  setCoachHighlight,
  subscribeCoachHighlight,
  COACH_LANE_LENSES,
} from './coachHighlight'

describe('coachHighlight', () => {
  it('publishes pulse ids and notifies subscribers', () => {
    clearCoachHighlight()
    const seen: number[] = []
    const unsub = subscribeCoachHighlight((h) => {
      if (h) seen.push(h.pulseId)
    })
    const a = setCoachHighlight({ tick: 0, kind: 'moment' })
    const b = setCoachHighlight({ tick: 480, kind: 'issue', lintId: 'x' })
    expect(b.pulseId).toBeGreaterThan(a.pulseId)
    expect(getCoachHighlight()?.tick).toBe(480)
    expect(seen.length).toBeGreaterThanOrEqual(2)
    clearCoachHighlight()
    expect(getCoachHighlight()).toBeNull()
    unsub()
  })

  it('exposes Ring, Voice-leading, and Issues lane toggles', () => {
    expect(COACH_LANE_LENSES.map((l) => l.id)).toEqual(['ring', 'voiceLead', 'issues'])
  })
})

