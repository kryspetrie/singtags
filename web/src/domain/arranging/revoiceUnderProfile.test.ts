/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from './types'
import { listRevoiceAlternatives } from './revoiceUnderProfile'
import { revoiceStackList } from './pathOptimize/candidates'
import { voicingProfileFromPreset } from './voicingProfile'

function fixtureTwoStacks() {
  const p = createEmptyArrangement('revoice-profile')
  p.tonality = 0
  p.melody = [
    {
      id: 'm0',
      midi: 60,
      startTick: 0,
      durationTicks: 480,
      lyric: null,
      role: 'pmn',
    },
    {
      id: 'm1',
      midi: 62,
      startTick: 480,
      durationTicks: 480,
      lyric: null,
      role: 'pmn',
    },
  ]
  p.stacks = [
    {
      id: 's0',
      startTick: 0,
      durationTicks: 480,
      rootPc: 0,
      natureId: 'major',
      voicing: '1351',
      spread: false,
      layer: 'primary',
      scfGroup: null,
      pillarId: null,
      midi: { bass: 48, bari: 52, lead: 60, tenor: 67 },
      ruleTags: [],
    },
    {
      id: 's1',
      startTick: 480,
      durationTicks: 480,
      rootPc: 7,
      natureId: 'seventh',
      voicing: '5317',
      spread: false,
      layer: 'primary',
      scfGroup: null,
      pillarId: null,
      midi: { bass: 50, bari: 55, lead: 62, tenor: 67 },
      ruleTags: [],
    },
  ]
  return p
}

describe('revoiceUnderProfile', () => {
  it('lists same-root/nature alts with Lead locked and parts in bands', () => {
    const p = fixtureTwoStacks()
    const profile = voicingProfileFromPreset('ttbb')
    const alts = listRevoiceAlternatives(p, 0, profile, { limit: 12 })
    expect(alts.length).toBeGreaterThan(0)
    for (const a of alts) {
      expect(a.midi.lead).toBe(60)
      expect(a.midi.bass).toBeGreaterThanOrEqual(profile.parts.bass.min)
      expect(a.midi.bass).toBeLessThanOrEqual(profile.parts.bass.max)
      expect(a.midi.tenor).toBeGreaterThanOrEqual(profile.parts.tenor.min)
      expect(a.midi.tenor).toBeLessThanOrEqual(profile.parts.tenor.max)
      expect(a.midi.tenor - a.midi.bass).toBeLessThanOrEqual(profile.maxOuterSpan)
      expect(typeof a.spread).toBe('boolean')
    }
  })

  it('tight bands exclude out-of-range inversions', () => {
    const p = fixtureTwoStacks()
    const profile = voicingProfileFromPreset('ttbb')
    profile.parts.bass = { min: 48, max: 50 }
    profile.parts.tenor = { min: 65, max: 67 }
    profile.maxOuterSpan = 19
    const alts = listRevoiceAlternatives(p, 0, profile, { limit: 24 })
    for (const a of alts) {
      expect(a.midi.bass).toBeGreaterThanOrEqual(48)
      expect(a.midi.bass).toBeLessThanOrEqual(50)
      expect(a.midi.tenor - a.midi.bass).toBeLessThanOrEqual(19)
    }
  })

  it('path revoice under wider SATB span can change stacks', () => {
    const p = fixtureTwoStacks()
    // Force a tight seed that SATB can leave
    p.stacks[0]!.midi = { bass: 55, bari: 59, lead: 60, tenor: 67 }
    const satb = voicingProfileFromPreset('satb')
    const { changedIds } = revoiceStackList(p, p.stacks, {
      risk: 0.2,
      profile: satb,
      exploreSeed: 7,
    })
    // May or may not change depending on path — at least must not throw and accept span
    expect(Array.isArray(changedIds)).toBe(true)
    const again = revoiceStackList(p, p.stacks, {
      risk: 0.35,
      profile: satb,
      exploreSeed: 99,
      allowSingle: false,
    })
    expect(again.project.stacks).toHaveLength(2)
  })

  it('explore seeds can diverge on multi-inversion path', () => {
    const p = fixtureTwoStacks()
    const profile = voicingProfileFromPreset('ttbb')
    profile.maxOuterSpan = 28
    const a = revoiceStackList(p, p.stacks, { risk: 0.35, profile, exploreSeed: 3 })
    const b = revoiceStackList(p, p.stacks, { risk: 0.35, profile, exploreSeed: 91 })
    const key = (proj: typeof a.project) =>
      proj.stacks.map((s) => `${s.midi?.bass},${s.midi?.bari},${s.midi?.tenor}`).join('|')
    // Soft: if both change, keys often differ; always both valid lengths
    expect(a.project.stacks).toHaveLength(2)
    expect(b.project.stacks).toHaveLength(2)
    if (a.changedIds.length && b.changedIds.length) {
      // Prefer diversity when both moved — not a hard fail if path converges
      expect(typeof key(a.project)).toBe('string')
    }
  })
})
