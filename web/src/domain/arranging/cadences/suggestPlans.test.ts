import { describe, expect, it } from 'vitest'
import { suggestCadencesForPhrase } from './suggestPlans'
import { materializeCadenceSteps } from './materialize'
import { cadenceById } from './catalog'
import type { CadenceContext } from './types'

const PPQ = 480

function moments(midis: number[]) {
  return midis.map((melodyMidi, i) => ({
    startTick: i * PPQ,
    endTick: (i + 1) * PPQ,
    melodyMidi,
  }))
}

describe('materializeCadenceSteps', () => {
  it('auth_v7_i on ^5→^1 yields V7 then I', () => {
    const def = cadenceById('auth_v7_i')!
    const ctx: CadenceContext = {
      tonality: 0,
      mode: 'major',
      melodyMidi: 67, // G
      nextMelodyMidi: 60, // C
      phraseRole: 'open',
    }
    const steps = materializeCadenceSteps(def, ctx)
    expect(steps?.map((s) => s.label)).toEqual(['V7', 'I'])
    expect(steps?.[0]?.rootPc).toBe(7)
    expect(steps?.[0]?.natureId).toBe('seventh')
    expect(steps?.[1]?.rootPc).toBe(0)
  })
})

describe('suggestCadencesForPhrase', () => {
  it('cad-auth-open: Lead G→C suggests V7→I plan', () => {
    const plans = suggestCadencesForPhrase({
      moments: moments([67, 60]),
      tonality: 0,
      phraseRoles: ['open', 'cadence'],
      bias: 'strong',
    })
    const auth = plans.find((p) => p.cadenceId === 'auth_v7_i')
    expect(auth).toBeTruthy()
    expect(auth!.steps.map((s) => s.label)).toEqual(['V7', 'I'])
    expect(auth!.startMomentIndex).toBe(0)
  })

  it('cad-circle-start: Lead D→G suggests II7→V7→I', () => {
    const plans = suggestCadencesForPhrase({
      moments: moments([62, 67, 60]),
      tonality: 0,
      bias: 'strong',
    })
    const circle = plans.find((p) => p.cadenceId === 'circle_ii_v_i' && p.startMomentIndex === 0)
    expect(circle).toBeTruthy()
    expect(circle!.steps.map((s) => s.label)).toEqual(['II7', 'V7', 'I'])
  })

  it('cad-i7-iv: Lead C→F suggests I7→IV', () => {
    const plans = suggestCadencesForPhrase({
      moments: moments([60, 65]),
      tonality: 0,
      phraseRoles: ['mid', 'mid'],
      bias: 'strong',
    })
    const p = plans.find((p) => p.cadenceId === 'primary_dom7')
    expect(p).toBeTruthy()
    expect(p!.steps.map((s) => s.label)).toEqual(['I7', 'IV'])
  })

  it('bias off returns empty', () => {
    expect(
      suggestCadencesForPhrase({
        moments: moments([67, 60]),
        tonality: 0,
        bias: 'off',
      }),
    ).toEqual([])
  })

  it('locked Sketch conflict is reported', () => {
    const plans = suggestCadencesForPhrase({
      moments: moments([67, 60]),
      tonality: 0,
      phraseRoles: ['open', 'cadence'],
      sketchSpans: [
        {
          startTick: 0,
          endTick: PPQ,
          rootPc: 0,
          natureId: 'major',
          locked: true,
        },
      ],
      bias: 'strong',
    })
    const auth = plans.find((p) => p.cadenceId === 'auth_v7_i')
    expect(auth).toBeTruthy()
    expect(auth!.conflicts.some((c) => /Locked Sketch/i.test(c))).toBe(true)
  })

  it('dedupes alias catalog hits that materialize to the same chords', () => {
    const plans = suggestCadencesForPhrase({
      moments: moments([67, 60, 67, 60, 67, 60]),
      tonality: 0,
      phraseRoles: ['open', 'cadence', 'mid', 'cadence', 'mid', 'cadence'],
      bias: 'strong',
      limit: 12,
    })
    const fingerprints = plans.map((p) =>
      p.steps.map((s) => `${s.rootPc}:${s.natureId}`).join('>'),
    )
    expect(new Set(fingerprints).size).toBe(fingerprints.length)
    // V7→I style should appear at most once (not auth + leading-tone + tag × starts).
    const v7i = plans.filter(
      (p) =>
        p.steps.length === 2 &&
        p.steps[0]?.natureId === 'seventh' &&
        p.steps[1]?.natureId === 'major',
    )
    expect(v7i.length).toBeLessThanOrEqual(1)
  })

  it('respects limit', () => {
    const plans = suggestCadencesForPhrase({
      moments: moments([67, 60, 62, 67, 60]),
      tonality: 0,
      bias: 'strong',
      limit: 2,
    })
    expect(plans.length).toBeLessThanOrEqual(2)
  })
})
