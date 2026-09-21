/**
 * Exhaustive Approach Three motion + contest allowlist matrices.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  classifyRootMotion,
  isChromaticStep,
  isM3Up,
  isP5Down,
  isP5Up,
  isSpringboardRoot,
  isTritone,
  pcDiff,
  scoreRootMotion,
  type RootMotionKind,
} from './approachThree'
import {
  allowlistForProfile,
  isNatureAllowed,
  ringTier,
  CHORDS_SAI11,
  CHORDS_BHS_EXTENDED,
} from './contestProfile'
import { scfRoots, type ScfGroup } from './scf'
import { BARBERSHOP_CHORDS } from './chords'
import type { ContestProfile } from './types'

const PCS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const
const TONALITIES = [0, 2, 5, 7, 9] as const // C D F G A
const ALL_KINDS: RootMotionKind[] = [
  'p5_down',
  'p5_up_cadential',
  'p5_up_retro',
  'chromatic',
  'tritone',
  'm3_up',
  'springboard',
  'other',
]

describe('pcDiff total order', () => {
  it.each(PCS.flatMap((a) => PCS.map((b) => [a, b] as const)))(
    'pcDiff(%i,%i) is in 0..11',
    (a, b) => {
      const d = pcDiff(a, b)
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThanOrEqual(11)
      expect(pcDiff(a, (a + d) % 12)).toBe(d)
    },
  )
})

describe('primitive interval detectors agree with pcDiff', () => {
  it.each(PCS.flatMap((a) => PCS.map((b) => [a, b] as const)))(
    'from %i to %i',
    (from, to) => {
      const d = pcDiff(from, to)
      expect(isP5Down(from, to)).toBe(d === 5)
      expect(isP5Up(from, to)).toBe(d === 7)
      expect(isChromaticStep(from, to)).toBe(d === 1 || d === 11)
      expect(isTritone(from, to)).toBe(d === 6)
      expect(isM3Up(from, to)).toBe(d === 4)
    },
  )
})

describe('classifyRootMotion full PC×PC×tonality×seventh matrix', () => {
  for (const tonality of TONALITIES) {
    describe(`tonality ${tonality}`, () => {
      it('every from→to yields a known RootMotionKind (no seventh)', () => {
        for (const from of PCS) {
          for (const to of PCS) {
            if (from === to) continue
            const kind = classifyRootMotion({
              fromRoot: from,
              toRoot: to,
              tonality,
              fromIsSeventh: false,
            })
            expect(ALL_KINDS).toContain(kind)
            // Without seventh, never chromatic/tritone/m3_up
            expect(['chromatic', 'tritone', 'm3_up']).not.toContain(kind)
          }
        }
      })

      it('seventh source unlocks chromatic/tritone/m3 when applicable', () => {
        let unlocked = 0
        for (const from of PCS) {
          for (const to of PCS) {
            if (from === to) continue
            const kind = classifyRootMotion({
              fromRoot: from,
              toRoot: to,
              tonality,
              fromIsSeventh: true,
            })
            expect(ALL_KINDS).toContain(kind)
            if (kind === 'chromatic' || kind === 'tritone' || kind === 'm3_up') unlocked++
          }
        }
        expect(unlocked).toBeGreaterThan(0)
      })

      it('I and IV are springboard roots', () => {
        expect(isSpringboardRoot(tonality, tonality)).toBe(true)
        expect(isSpringboardRoot((tonality + 5) % 12, tonality)).toBe(true)
        expect(isSpringboardRoot((tonality + 7) % 12, tonality)).toBe(false)
      })
    })
  }

  it('scoreRootMotion is monotonic in preferred table order', () => {
    const order: RootMotionKind[] = [
      'p5_down',
      'p5_up_cadential',
      'springboard',
      'chromatic',
      'tritone',
      'm3_up',
      'p5_up_retro',
      'other',
    ]
    for (let i = 0; i < order.length - 1; i++) {
      expect(scoreRootMotion(order[i]!, false)).toBeGreaterThanOrEqual(
        scoreRootMotion(order[i + 1]!, false),
      )
    }
    for (const k of ALL_KINDS) {
      expect(scoreRootMotion(k, true) - scoreRootMotion(k, false)).toBe(4)
    }
  })
})

describe('contest allowlist × every nature', () => {
  const profiles: ContestProfile[] = ['sai11', 'bhs_extended', 'learning']
  const natures = BARBERSHOP_CHORDS.map((c) => c.id)

  it.each(profiles)('profile %s allowlist is non-empty and consistent with isNatureAllowed', (profile) => {
    const list = allowlistForProfile(profile)
    expect(list.length).toBeGreaterThan(0)
    for (const id of list) {
      expect(isNatureAllowed(profile, id)).toBe(true)
    }
    for (const id of natures) {
      expect(isNatureAllowed(profile, id)).toBe(list.includes(id))
    }
  })

  it('sai11 is subset of bhs_extended', () => {
    for (const id of CHORDS_SAI11) {
      expect(CHORDS_BHS_EXTENDED).toContain(id)
    }
  })

  it('half-dim and dim only outside sai11', () => {
    expect(isNatureAllowed('sai11', 'half-dim')).toBe(false)
    expect(isNatureAllowed('sai11', 'dim')).toBe(false)
    expect(isNatureAllowed('bhs_extended', 'half-dim')).toBe(true)
    expect(isNatureAllowed('learning', 'dim')).toBe(true)
  })

  it.each(natures)('ringTier(%s) is 1..7', (id) => {
    const t = ringTier(id)
    expect(t).toBeGreaterThanOrEqual(1)
    expect(t).toBeLessThanOrEqual(7)
  })
})

describe('SCF roots for every primary × group', () => {
  const groups: ScfGroup[] = [1, 2, 3, 4, 5, 6]
  it.each(PCS.flatMap((r) => groups.map((g) => [r, g] as const)))(
    'primary %i group %i yields pcs in 0..11',
    (primary, group) => {
      const roots = scfRoots(primary, group)
      expect(roots.length).toBeGreaterThan(0)
      for (const r of roots) {
        expect(r).toBeGreaterThanOrEqual(0)
        expect(r).toBeLessThanOrEqual(11)
      }
    },
  )
})
