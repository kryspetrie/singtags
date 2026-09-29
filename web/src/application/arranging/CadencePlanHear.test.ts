import { describe, expect, it } from 'vitest'
import {
  cadencePlanReplaceRange,
  voiceCadencePlanHearPath,
} from './CadencePlanHear'
import type { CadenceSuggestion } from '../../domain/arranging/cadences'

const PPQ = 480

function moments(midis: number[]) {
  return midis.map((melodyMidi, i) => ({
    startTick: i * PPQ,
    endTick: (i + 1) * PPQ,
    melodyMidi,
  }))
}

const authPlan: CadenceSuggestion = {
  id: 'auth_v7_i@0',
  cadenceId: 'auth_v7_i',
  label: 'V7→I',
  teach: '',
  glossaryIds: [],
  strength: 1,
  priority: 1,
  startMomentIndex: 0,
  steps: [
    { momentOffset: 0, rootPc: 7, natureId: 'seventh', label: 'V7', role: 'approach' },
    { momentOffset: 1, rootPc: 0, natureId: 'major', label: 'I', role: 'arrival' },
  ],
  conflicts: [],
  evidence: '',
}

describe('CadencePlanHear', () => {
  it('replace range spans all plan moments', () => {
    const range = cadencePlanReplaceRange(authPlan, moments([67, 60]))
    expect(range).toEqual({ startTick: 0, endTick: 2 * PPQ })
  })

  it('voices one TTBB stack per step', () => {
    const path = voiceCadencePlanHearPath(authPlan, moments([67, 60]), { tonality: 0 })
    expect(path).toHaveLength(2)
    for (const m of path) {
      expect(m.tenor).toBeGreaterThan(m.lead)
      expect(m.bass).toBeLessThanOrEqual(m.bari)
    }
  })
})
