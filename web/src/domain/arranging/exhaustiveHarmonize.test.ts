/**
 * Harmonize / generate / rank iterations across leads, roots, profiles, SCF.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  autoHarmonizeMelody,
  candidatesForMelodyNote,
  generateCandidates,
  rankCandidates,
} from './harmonize'
import { isNatureAllowed } from './contestProfile'
import { createEmptyArrangement, type ContestProfile, type MelodyEvent, type Pillar } from './types'
import { lintArrangement } from './qa'
import { strengthenStacks } from './strengthen'

const LEADS = [57, 59, 60, 62, 64, 65, 67, 69, 71] as const
const ROOTS = [0, 2, 5, 7, 9] as const
const PROFILES: ContestProfile[] = ['sai11', 'bhs_extended', 'learning']

function note(midi: number, start = 0, role: MelodyEvent['role'] = 'pmn'): MelodyEvent {
  return { id: `n${midi}-${start}`, midi, startTick: start, durationTicks: 480, role }
}

function pillar(rootPc: number): Pillar {
  return { id: `p${rootPc}`, rootPc, startTick: 0, endTick: 20000, source: 'user', confirmed: true }
}

describe('generateCandidates iterations', () => {
  for (const profile of PROFILES) {
    describe(`profile ${profile}`, () => {
      it.each(ROOTS.flatMap((r) => LEADS.map((l) => [r, l] as const)))(
        'root %i lead %i: all candidates legal + TTBB ordered',
        (rootPc, lead) => {
          const cands = generateCandidates({
            note: note(lead),
            pillar: pillar(rootPc),
            tonality: rootPc,
            prevRootPc: null,
            profile,
            preferScf: true,
          })
          for (const c of cands) {
            expect(isNatureAllowed(profile, c.natureId)).toBe(true)
            expect(c.midi.lead).toBe(lead)
            expect(c.midi.tenor).toBeGreaterThan(c.midi.lead)
            expect(c.midi.bass).toBeLessThanOrEqual(Math.min(c.midi.bari, c.midi.lead))
          }
          // Ranking is stable descending
          const ranked = rankCandidates(cands)
          for (let i = 1; i < ranked.length; i++) {
            expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score)
          }
        },
      )
    })
  }

  it('prevRootPc null vs valued changes motion tags for some leads', () => {
    const withNull = generateCandidates({
      note: note(60),
      pillar: pillar(0),
      tonality: 0,
      prevRootPc: null,
    })
    const withPrev = generateCandidates({
      note: note(60),
      pillar: pillar(0),
      tonality: 0,
      prevRootPc: 7,
    })
    expect(withNull.length + withPrev.length).toBeGreaterThan(0)
    // springboard tags only when prev is null path for I takeoff — at least one side has tags
    expect(
      withNull.some((c) => c.ruleTags.length > 0) || withPrev.some((c) => c.ruleTags.length > 0),
    ).toBe(true)
  })
})

describe('autoHarmonizeMelody phrase iterations', () => {
  const phrases: number[][] = [
    [60, 62, 64, 65, 67],
    [67, 65, 64, 62, 60],
    [60, 60, 60, 60],
    [55, 57, 59, 60, 62, 64, 65, 67],
    [72, 71, 69, 67, 65],
    [60, 64, 67, 72, 67, 64, 60],
    [62, 65, 69, 65, 62],
    [48, 52, 55, 60], // low edge
    [70, 72, 74, 72, 70], // high edge
  ]

  it.each(phrases.map((p, i) => [i, p] as const))(
    'phrase %i auto-harmonizes under sai11 without throwing',
    (_i, midis) => {
      const melody = midis.map((m, i) => note(m, i * 480, i % 2 === 0 ? 'pmn' : 'smn'))
      const stacks = autoHarmonizeMelody({
        melody,
        pillars: [pillar(0)],
        tonality: 0,
        profile: 'sai11',
        preferScfForSmn: true,
      })
      expect(stacks.length).toBeGreaterThan(0)
      expect(stacks.length).toBeLessThanOrEqual(melody.length)
      for (let i = 0; i < stacks.length; i++) {
        const s = stacks[i]!
        expect(s.midi).not.toBeNull()
        expect(isNatureAllowed('sai11', s.natureId)).toBe(true)
        const mel = melody.find((n) => n.startTick === s.startTick)
        if (mel) expect(s.midi!.lead).toBe(mel.midi)
      }
    },
  )

  it.each(PROFILES)('profile %s: 8-note scale phrase stays in allowlist', (profile) => {
    const melody = [0, 2, 4, 5, 7, 9, 11, 12].map((semi, i) =>
      note(60 + semi, i * 480, i % 3 === 0 ? 'pmn' : 'smn'),
    )
    const stacks = autoHarmonizeMelody({
      melody,
      pillars: [pillar(0)],
      tonality: 0,
      profile,
      preferScfForSmn: true,
    })
    expect(stacks.every((s) => isNatureAllowed(profile, s.natureId))).toBe(true)
  })

  it.each(ROOTS)('tonality/pillar root %i cadence phrase', (root) => {
    const melody = [0, 2, 4, 5, 7].map((semi, i) => note(60 + semi, i * 480))
    const stacks = autoHarmonizeMelody({
      melody,
      pillars: [pillar(root)],
      tonality: root,
      profile: 'sai11',
    })
    expect(stacks.length).toBeGreaterThan(0)
  })
})

describe('candidatesForMelodyNote limits and SCF preference', () => {
  it.each([1, 4, 8, 16, 32] as const)('limit %i caps results', (limit) => {
    const cands = candidatesForMelodyNote({
      note: note(60),
      pillar: pillar(0),
      tonality: 0,
      prevRootPc: null,
      preferScf: true,
      limit,
    })
    expect(cands.length).toBeLessThanOrEqual(limit)
  })

  it('SMN preferScf tends to include passing layer when available', () => {
    const cands = candidatesForMelodyNote({
      note: note(62, 480, 'smn'),
      pillar: pillar(0),
      tonality: 0,
      prevRootPc: 0,
      preferScf: true,
      limit: 32,
    })
    // Not guaranteed for every lead — if any candidates, check structure
    for (const c of cands) {
      if (c.layer === 'passing') expect(c.scfGroup).not.toBeNull()
    }
  })
})

describe('strengthen + lint do not throw across phrases', () => {
  it.each([
    [[60, 64, 67]],
    [[67, 65, 64, 62, 60, 59, 57, 55]],
    [[60]],
    [[62, 62, 62, 64, 65]],
  ])('strengthen phrase %j', (midis) => {
    const p = createEmptyArrangement()
    p.melody = midis.map((m, i) => note(m, i * 240))
    p.pillars = [pillar(0)]
    p.contestProfile = 'sai11'
    p.stacks = autoHarmonizeMelody({
      melody: p.melody,
      pillars: p.pillars,
      tonality: 0,
    })
    const next = strengthenStacks(p, { minScoreGain: 0.5 })
    expect(next.length).toBeGreaterThan(0)
    expect(() => lintArrangement({ ...p, stacks: next })).not.toThrow()
  })
})
