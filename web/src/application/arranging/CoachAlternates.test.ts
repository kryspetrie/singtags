import { describe, expect, it } from 'vitest'
import { buildHarmonicMoments } from '../../domain/arranging/harmonicMoments'
import { createEmptyArrangement, type MelodyEvent } from '../../domain/arranging/types'
import {
  altChipsForMoment,
  filterCandidates,
  layerHintForCandidate,
  pickCandidateForAltChip,
} from './CoachAlternates'
import type { HarmonizeCandidate } from '../../domain/arranging/harmonize'

const mel = (id: string, start: number, dur: number, midi = 67): MelodyEvent => ({
  id,
  midi,
  startTick: start,
  durationTicks: dur,
  role: 'pmn',
})

const cand = (over: Partial<HarmonizeCandidate> = {}): HarmonizeCandidate => ({
  rootPc: 0,
  natureId: 'seventh',
  voicing: '1513',
  spread: false,
  layer: 'primary',
  scfGroup: null,
  midi: { bass: 48, bari: 55, lead: 67, tenor: 72 },
  score: 10,
  ruleTags: [],
  label: 'C7',
  ...over,
})

describe('CoachAlternates', () => {
  it('filters candidates by family', () => {
    const list = [
      cand({ layer: 'primary', natureId: 'major' }),
      cand({ layer: 'passing', scfGroup: 2, rootPc: 2, natureId: 'm7' }),
      cand({ natureId: 'seventh', rootPc: 7 }),
    ]
    expect(filterCandidates(list, 'pcf')).toHaveLength(2)
    expect(filterCandidates(list, 'scf')).toHaveLength(1)
    expect(filterCandidates(list, 'sevenths')).toHaveLength(1)
  })

  it('layer hint glosses SCF without raw G2 alone', () => {
    expect(layerHintForCandidate(cand({ layer: 'passing', scfGroup: 2 }))).toMatch(/group 2/)
    expect(layerHintForCandidate(cand({ layer: 'primary' }))).toBe('home family')
  })

  it('hides alt chips with no matching candidate', () => {
    const p = createEmptyArrangement('Alt')
    p.melody = [mel('post', 0, 960)]
    p.pillars = [
      {
        id: 'pil1',
        startTick: 0,
        endTick: 960,
        rootPc: 0,
        confirmed: true,
        source: 'user',
      },
    ]
    const moment = buildHarmonicMoments(p.melody, [
      { startTick: 0, durationTicks: 480, midi: 48 },
      { startTick: 480, durationTicks: 480, midi: 50 },
    ])[1]!
    const empty = altChipsForMoment(p, moment, [], false)
    expect(empty).toEqual([])
    const withHit = altChipsForMoment(p, moment, [cand({ rootPc: 0, natureId: 'seventh' })], false)
    expect(withHit.length).toBeGreaterThan(0)
    const picked = pickCandidateForAltChip(withHit.length ? [cand({ rootPc: 0, natureId: 'seventh' })] : [], withHit[0]!)
    expect(picked?.rootPc).toBe(0)
  })
})
