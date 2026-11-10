import { describe, expect, it } from 'vitest'
import {
  applyNatureHysteresis,
  createNatureHysteresis,
  matchNatureFromPcs,
} from './natureMatch'

describe('natureMatch', () => {
  it('matches C7 PC set to seventh on C', () => {
    const m = matchNatureFromPcs([0, 4, 7, 10])
    expect(m?.natureId).toBe('seventh')
    expect(m?.rootPc).toBe(0)
  })

  it('matches C major triad', () => {
    const m = matchNatureFromPcs([0, 4, 7])
    expect(m?.natureId).toBe('major')
    expect(m?.rootPc).toBe(0)
  })

  it('hysteresis keeps prior nature until hold frames agree', () => {
    let s = createNatureHysteresis()
    let out = applyNatureHysteresis(s, { natureId: 'seventh', rootPc: 0, confidence: 1 }, {
      holdFrames: 3,
    })
    s = out.state
    expect(out.match?.natureId).toBe('seventh')
    out = applyNatureHysteresis(s, { natureId: 'major', rootPc: 0, confidence: 1 }, {
      holdFrames: 3,
    })
    // Still seventh after one disagreeing frame
    expect(out.match?.natureId).toBe('seventh')
  })
})
