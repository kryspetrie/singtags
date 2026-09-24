/**
 * Classic cadence catalog + scoring goldens.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { CADENCE_CATALOG, cadenceById } from './catalog'
import {
  cadenceHintForContext,
  cadenceMissMessage,
  scoreCadenceFit,
} from './score'
import { inferPhraseRole, phraseRoleAtMelodyIndex } from './phraseRole'
import { scaleForBias } from './prefs'
import type { CadenceContext } from './types'

function ctx(partial: Partial<CadenceContext> & Pick<CadenceContext, 'melodyMidi'>): CadenceContext {
  return {
    tonality: 0,
    mode: 'major',
    ...partial,
  }
}

describe('cadence catalog', () => {
  it('includes core textbook ids', () => {
    const ids = CADENCE_CATALOG.map((c) => c.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'auth_v7_i',
        'lead_tone_v7',
        'circle_ii_v_i',
        'primary_dom7',
        'circle_frag',
        'plagal_iv_i',
        'tag_penult',
        'half_cad',
        'light_bII',
        'backdoor',
      ]),
    )
  })

  it('auth_v7_i: ^5→^1 prefers V7 and demotes I', () => {
    const c = ctx({ melodyMidi: 67, nextMelodyMidi: 60 }) // G→C
    const def = cadenceById('auth_v7_i')!
    expect(def.matchContext(c).hit).toBe(true)
    expect(def.boostCandidate({ rootPc: 7, natureId: 'seventh' }, c)).toBeGreaterThan(10)
    expect(def.boostCandidate({ rootPc: 0, natureId: 'major' }, c)).toBeLessThan(0)
  })

  it('lead_tone_v7: ^7→^1 prefers V7', () => {
    const c = ctx({ melodyMidi: 59, nextMelodyMidi: 60 }) // B→C
    const def = cadenceById('lead_tone_v7')!
    expect(def.matchContext(c).hit).toBe(true)
    expect(def.boostCandidate({ rootPc: 7, natureId: 'seventh' }, c)).toBeGreaterThan(10)
    expect(def.boostCandidate({ rootPc: 0, natureId: 'major' }, c)).toBeLessThan(0)
  })

  it('circle_ii_v_i: after II7 prefers V7', () => {
    const c = ctx({
      melodyMidi: 67,
      prevRootPc: 2,
      prevNatureId: 'seventh',
    })
    const def = cadenceById('circle_ii_v_i')!
    expect(def.matchContext(c).hit).toBe(true)
    expect(def.boostCandidate({ rootPc: 7, natureId: 'seventh' }, c)).toBeGreaterThan(10)
  })

  it('primary_dom7: tonic→IV prefers I7', () => {
    const c = ctx({ melodyMidi: 60, nextMelodyMidi: 65, nextPillarRoot: 5 })
    const def = cadenceById('primary_dom7')!
    expect(def.matchContext(c).hit).toBe(true)
    expect(def.boostCandidate({ rootPc: 0, natureId: 'seventh' }, c)).toBeGreaterThan(5)
    expect(def.boostCandidate({ rootPc: 0, natureId: 'major' }, c)).toBeLessThan(0)
  })

  it('priority-3 color stays out of Detected aggregate by default', () => {
    const c = ctx({ melodyMidi: 61 }) // Db — ♭2
    const withColor = scoreCadenceFit(
      { rootPc: 1, natureId: 'seventh' },
      c,
      { includeColor: true, bias: 'strong' },
    )
    const detected = scoreCadenceFit(
      { rootPc: 1, natureId: 'seventh' },
      c,
      { maxPriority: 2, bias: 'strong' },
    )
    expect(withColor.parts.some((p) => p.id === 'light_bII')).toBe(true)
    expect(detected.parts.some((p) => p.id === 'light_bII')).toBe(false)
  })

  it('scoreCadenceFit returns hint for ^5→^1 V7', () => {
    const c = ctx({ melodyMidi: 67, nextMelodyMidi: 60 })
    const r = scoreCadenceFit({ rootPc: 7, natureId: 'seventh' }, c, { bias: 'strong' })
    expect(r.boost).toBeGreaterThan(10)
    expect(r.hint?.id).toBe('auth_v7_i')
  })

  it('cadenceHintForContext surfaces auth opening', () => {
    const hint = cadenceHintForContext(ctx({ melodyMidi: 67, nextMelodyMidi: 60 }))
    expect(hint?.id).toBe('auth_v7_i')
  })

  it('cadenceMissMessage flags locked I under ^5→^1', () => {
    const miss = cadenceMissMessage(
      { rootPc: 0, natureId: 'major' },
      ctx({ melodyMidi: 67, nextMelodyMidi: 60 }),
    )
    expect(miss?.suggest?.natureId).toBe('seventh')
    expect(miss?.suggest?.rootPc).toBe(7)
  })

  it('bias off zeroes boosts', () => {
    const c = ctx({ melodyMidi: 67, nextMelodyMidi: 60 })
    const r = scoreCadenceFit({ rootPc: 7, natureId: 'seventh' }, c, { bias: 'off' })
    expect(r.boost).toBe(0)
    expect(scaleForBias('moderate')).toBeCloseTo(0.55)
  })
})

describe('phraseRole', () => {
  it('infers open / cadence / tag', () => {
    expect(inferPhraseRole({ startTick: 0, endTick: 4000, afterRest: true })).toBe('open')
    expect(
      inferPhraseRole({ startTick: 3000, endTick: 4000, beforeRest: true }),
    ).toBe('cadence')
    expect(inferPhraseRole({ startTick: 3900, endTick: 4000, nearEnd: true })).toBe('tag')
  })

  it('phraseRoleAtMelodyIndex uses gaps', () => {
    const onsets = [
      { startTick: 0, durationTicks: 240 },
      { startTick: 960, durationTicks: 240 },
      { startTick: 3600, durationTicks: 240 },
    ]
    expect(phraseRoleAtMelodyIndex(onsets, 0, 4000)).toBe('open')
    expect(phraseRoleAtMelodyIndex(onsets, 2, 4000)).toBe('tag')
  })
})
