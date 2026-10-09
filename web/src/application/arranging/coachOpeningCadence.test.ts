/**
 * Coach Choose must keep V7→I openings when the candidate target is a
 * harmonic-moment id (not the Lead note id).
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from '../../domain/arranging/types'
import { applyCandidateToProject, listCandidatesForNote } from './AutoHarmonize'

describe('Coach opening cadence ranking', () => {
  it('prefers F7 5713 (close) for Bonnie ^5→^1 even with a moment-shaped target id', () => {
    const p = createEmptyArrangement()
    p.tonality = 10 // Bb
    p.preferFlats = true
    p.melody = [
      { id: 'm0', midi: 65, startTick: 0, durationTicks: 240, role: 'pmn' }, // F = ^5
      { id: 'm1', midi: 58, startTick: 240, durationTicks: 480, role: 'pmn' }, // Bb = ^1
    ]
    // Coach selectMoment often targets a synthetic / held-post id.
    const momentTarget = {
      id: 'hm-0',
      midi: 65,
      startTick: 0,
      durationTicks: 240,
      role: 'pmn' as const,
    }
    const soft = { detectedSpans: [{ startTick: 0, endTick: 240, rootPc: 5 }] }
    const top = listCandidatesForNote(p, momentTarget, {
      limit: 8,
      softContext: soft,
      pathWeights: { risk: 0 },
    })[0]!
    expect(top.rootPc).toBe(5)
    expect(top.natureId).toBe('seventh')
    // Soft closedVoicing prefers octave-or-tighter (5713) when both place.
    expect(top.midi.tenor - top.midi.bass).toBeLessThanOrEqual(12)
    expect(top.voicing).toBe('5713')
    expect(top.spread).toBe(false)
  })

  it('Fill empties prefers Detected quality over bare implied triad', () => {
    const p = createEmptyArrangement()
    p.tonality = 10
    p.preferFlats = true
    p.melody = [
      { id: 'm0', midi: 65, startTick: 0, durationTicks: 240, role: 'pmn' },
      { id: 'm1', midi: 58, startTick: 240, durationTicks: 480, role: 'pmn' },
    ]
    const soft = {
      detectedSpans: [
        { startTick: 0, endTick: 240, rootPc: 5, natureId: 'seventh' },
      ],
    }
    const cands = listCandidatesForNote(p, p.melody[0]!, {
      limit: 12,
      softContext: soft,
      pathWeights: { risk: 0 },
    })
    const exact = cands.find((c) => c.rootPc === 5 && c.natureId === 'seventh')
    expect(exact).toBeTruthy()
    // Same preference Fill empties uses: match soft nature before first-ranked triad.
    const picked =
      cands.find((c) => c.rootPc === 5 && c.natureId === 'seventh') ??
      cands.find((c) => c.rootPc === 5) ??
      cands[0]
    expect(picked?.natureId).toBe('seventh')
    expect(picked!.midi.tenor - picked!.midi.bass).toBeLessThanOrEqual(12)
  })

  it('Apply keeps pillarId under succession (short endTick before next pillar)', () => {
    const p = createEmptyArrangement()
    p.tonality = 0
    p.melody = [
      { id: 'a', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
      { id: 'b', midi: 64, startTick: 480, durationTicks: 480, role: 'pmn' },
    ]
    p.pillars = [
      { id: 'p1', rootPc: 0, startTick: 0, endTick: 240, source: 'user', confirmed: true },
      { id: 'p2', rootPc: 7, startTick: 960, endTick: 1440, source: 'user', confirmed: true },
    ]
    const cands = listCandidatesForNote(p, p.melody[1]!)
    expect(cands[0]).toBeTruthy()
    const next = applyCandidateToProject(p, p.melody[1]!, cands[0]!)
    expect(next.stacks.find((s) => s.startTick === 480)?.pillarId).toBe('p1')
  })
})
