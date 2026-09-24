/**
 * Classic barbershop cadence patterns — shared Detected + Coach source of truth.
 */
import { degreeOf, isDominantOf } from '../secondaryDominant'
import { isDominantNature } from '../tensionRelease'
import type {
  CadenceContext,
  CadenceDef,
  CadenceMatch,
} from './types'

function pc(n: number): number {
  return ((n % 12) + 12) % 12
}

function melDeg(ctx: CadenceContext): number {
  return degreeOf(ctx.melodyMidi, ctx.tonality)
}

function nextDeg(ctx: CadenceContext): number | null {
  if (ctx.nextMelodyMidi == null) return null
  return degreeOf(ctx.nextMelodyMidi, ctx.tonality)
}

function rootDeg(rootPc: number, tonality: number): number {
  return degreeOf(rootPc, tonality)
}

function isSeventhish(natureId: string): boolean {
  return natureId === 'seventh' || natureId === 'ninth'
}

function isTriad(natureId: string): boolean {
  return natureId === 'major' || natureId === 'minor'
}

function tonicPc(ctx: CadenceContext): number {
  return pc(ctx.tonality)
}

function dominantPc(ctx: CadenceContext): number {
  return pc(ctx.tonality + 7)
}

function subdominantPc(ctx: CadenceContext): number {
  return pc(ctx.tonality + 5)
}

function supertonicPc(ctx: CadenceContext): number {
  return pc(ctx.tonality + 2)
}

function flatTwoPc(ctx: CadenceContext): number {
  return pc(ctx.tonality + 1)
}

function flatSevenPc(ctx: CadenceContext): number {
  return pc(ctx.tonality + 10)
}

function hit(strength: number): CadenceMatch {
  return { hit: strength > 0, strength: Math.min(1, Math.max(0, strength)) }
}

function miss(): CadenceMatch {
  return { hit: false, strength: 0 }
}

/** V7 → I when Lead ^5 resolves to ^1 (phrase opening / authentic). */
const authV7I: CadenceDef = {
  id: 'auth_v7_i',
  label: 'V7→I',
  shortTeach: 'Lead ^5 resolving to ^1 almost always wants V7→I — the fundamental authentic cadence.',
  glossaryIds: ['tension_release', 'bs7', 'leading_tone'],
  priority: 1,
  matchContext(ctx) {
    const n = nextDeg(ctx)
    if (n == null) return miss()
    if (melDeg(ctx) === 7 && n === 0) return hit(1)
    // Prev was V7 and we are on tonic melody → completing authentic.
    if (
      ctx.prevRootPc != null &&
      ctx.prevNatureId != null &&
      isDominantNature(ctx.prevNatureId) &&
      isDominantOf(ctx.prevRootPc, tonicPc(ctx)) &&
      melDeg(ctx) === 0
    ) {
      return hit(0.85)
    }
    return miss()
  },
  boostCandidate(cand, ctx) {
    const m = this.matchContext(ctx)
    if (!m.hit) return 0
    const deg = rootDeg(cand.rootPc, ctx.tonality)
    const s = m.strength
    // Opening ^5→^1: prefer V7, demote tonic under the ^5.
    if (melDeg(ctx) === 7 && nextDeg(ctx) === 0) {
      if (isSeventhish(cand.natureId) && deg === 7) return 22 * s
      if (isTriad(cand.natureId) && deg === 7) return 8 * s
      if (deg === 0) return -18 * s
      return 0
    }
    // Completing into I after V7.
    if (deg === 0 && isTriad(cand.natureId)) return 14 * s
    if (deg === 0 && isSeventhish(cand.natureId)) return -4 * s
    return 0
  },
  teachWhy() {
    return 'Lead ^5→^1 (or V7 into tonic) is the classic authentic cadence — prefer V7 then I.'
  },
}

/** V7 → I when Lead ^7 (leading tone) resolves to ^1. */
const leadToneV7: CadenceDef = {
  id: 'lead_tone_v7',
  label: 'Leading-tone V7→I',
  shortTeach: 'Lead ^7→^1 is the leading-tone story — hang a V7 under the ^7, then release to I.',
  glossaryIds: ['leading_tone', 'tension_release', 'bs7'],
  priority: 1,
  matchContext(ctx) {
    const n = nextDeg(ctx)
    if (n == null) return miss()
    if (melDeg(ctx) === 11 && n === 0) return hit(1)
    return miss()
  },
  boostCandidate(cand, ctx) {
    const m = this.matchContext(ctx)
    if (!m.hit) return 0
    const deg = rootDeg(cand.rootPc, ctx.tonality)
    const s = m.strength
    if (isSeventhish(cand.natureId) && deg === 7) return 20 * s
    if (isTriad(cand.natureId) && deg === 7) return 6 * s
    if (deg === 0 || deg === 5) return -12 * s
    return 0
  },
  teachWhy() {
    return 'Lead ^7 wants V7 (dominant of I), then resolve to tonic — not I or IV under the leading tone.'
  },
}

/** II7 → V7 → I circle-of-fifths highway. */
const circleIiVI: CadenceDef = {
  id: 'circle_ii_v_i',
  label: 'II7→V7→I',
  shortTeach: 'Descending fifths II7→V7→I is the barbershop harmonic highway into tonic.',
  glossaryIds: ['circle_fifths', 'secondary_dom', 'bs7'],
  priority: 1,
  matchContext(ctx) {
    // After II7, drive toward V7.
    if (
      ctx.prevRootPc != null &&
      ctx.prevNatureId != null &&
      isSeventhish(ctx.prevNatureId) &&
      rootDeg(ctx.prevRootPc, ctx.tonality) === 2
    ) {
      return hit(1)
    }
    // Melody on ^2 with next toward ^5 / dominant or tonic ahead → start II7.
    const n = nextDeg(ctx)
    if (melDeg(ctx) === 2 && (n === 7 || n === 0 || n === 11)) return hit(0.75)
    // Locked neighbor after is V or I and we sit on ^2.
    const after = ctx.lockedNeighbors?.after
    if (
      after &&
      melDeg(ctx) === 2 &&
      (pc(after.rootPc) === dominantPc(ctx) || pc(after.rootPc) === tonicPc(ctx))
    ) {
      return hit(0.7)
    }
    return miss()
  },
  boostCandidate(cand, ctx) {
    const m = this.matchContext(ctx)
    if (!m.hit) return 0
    const deg = rootDeg(cand.rootPc, ctx.tonality)
    const s = m.strength
    const afterIi =
      ctx.prevRootPc != null &&
      ctx.prevNatureId != null &&
      isSeventhish(ctx.prevNatureId) &&
      rootDeg(ctx.prevRootPc, ctx.tonality) === 2
    if (afterIi) {
      if (isSeventhish(cand.natureId) && deg === 7) return 18 * s
      if (isTriad(cand.natureId) && deg === 7) return 6 * s
      // Demote random SCF mid-highway.
      if (cand.layer === 'passing' && deg !== 7 && deg !== 0) return -8 * s
      return 0
    }
    // Starting the highway: prefer II7.
    if (isSeventhish(cand.natureId) && deg === 2) return 14 * s
    if (cand.natureId === 'm7' && deg === 2) return 8 * s
    return 0
  },
  teachWhy(ctx) {
    if (
      ctx.prevRootPc != null &&
      rootDeg(ctx.prevRootPc, ctx.tonality) === 2
    ) {
      return 'After II7, continue the circle: V7 next, then I.'
    }
    return 'II7→V7→I is the descending-fifths highway into the tonic pillar.'
  },
}

/** I7 → IV when tonic melody aims at subdominant. */
const primaryDom7: CadenceDef = {
  id: 'primary_dom7',
  label: 'I7→IV',
  shortTeach: 'When the next home is IV, I7 acts as V7/IV — the primary dominant into the subdominant.',
  glossaryIds: ['secondary_dom', 'bs7', 'springboard'],
  priority: 1,
  matchContext(ctx) {
    if (melDeg(ctx) !== 0) return miss()
    const n = nextDeg(ctx)
    // Require melody (or locked neighbor) evidence — a later IV pillar alone is too common
    // and must not flip Coach home triad (I over I7) when the lead is the tonic root.
    if (n === 5) return hit(0.95)
    if (
      ctx.lockedNeighbors?.after != null &&
      pc(ctx.lockedNeighbors.after.rootPc) === subdominantPc(ctx)
    ) {
      return hit(0.7)
    }
    return miss()
  },
  boostCandidate(cand, ctx) {
    const m = this.matchContext(ctx)
    if (!m.hit) return 0
    const deg = rootDeg(cand.rootPc, ctx.tonality)
    const s = m.strength
    if (isSeventhish(cand.natureId) && deg === 0) return 12 * s
    if (isTriad(cand.natureId) && deg === 0) return -6 * s
    return 0
  },
  teachWhy() {
    return 'Next home is IV — prefer I7 (V7 of IV) over a plain tonic triad.'
  },
}

/** Soft circle fragment: root down P5 toward pillar. */
const circleFrag: CadenceDef = {
  id: 'circle_frag',
  label: 'Circle step',
  shortTeach: 'Root motion down a fifth toward the next pillar keeps the harmonic highway moving.',
  glossaryIds: ['circle_fifths'],
  priority: 2,
  matchContext(ctx) {
    if (ctx.prevRootPc == null) return miss()
    if (ctx.nextPillarRoot == null && ctx.pillarRoot == null) return miss()
    return hit(0.45)
  },
  boostCandidate(cand, ctx) {
    const m = this.matchContext(ctx)
    if (!m.hit || ctx.prevRootPc == null) return 0
    const downP5 = pc(ctx.prevRootPc - cand.rootPc) === 7
    if (!downP5) return 0
    const target = ctx.nextPillarRoot ?? ctx.pillarRoot
    if (target == null) return 3 * m.strength
    // Prefer steps that approach the target (or land on it).
    if (pc(cand.rootPc) === pc(target) || isDominantOf(cand.rootPc, target)) {
      return 6 * m.strength
    }
    return 2.5 * m.strength
  },
  teachWhy() {
    return 'Descending-fifth root motion toward the pillar is the circle-of-fifths highway.'
  },
}

/** Plagal IV → I at phrase end. */
const plagalIvI: CadenceDef = {
  id: 'plagal_iv_i',
  label: 'IV→I (plagal)',
  shortTeach: 'A plagal close (IV→I) suits amen / soft phrase endings when the Lead sits on ^1 or ^6.',
  glossaryIds: ['circle_fifths'],
  priority: 2,
  matchContext(ctx) {
    const role = ctx.phraseRole
    if (role !== 'cadence' && role !== 'tag') return miss()
    const d = melDeg(ctx)
    if (d === 0 || d === 9 || d === 5) return hit(0.65)
    return miss()
  },
  boostCandidate(cand, ctx) {
    const m = this.matchContext(ctx)
    if (!m.hit) return 0
    const deg = rootDeg(cand.rootPc, ctx.tonality)
    const s = m.strength
    if (isTriad(cand.natureId) && deg === 5) return 8 * s
    // Soft demote V7 when plagal is the clearer close.
    if (isSeventhish(cand.natureId) && deg === 7) return -3 * s
    return 0
  },
  teachWhy() {
    return 'Phrase-end amen feel — prefer IV into I rather than forcing another V7.'
  },
}

/** Tag penultimate: prefer V7 (or II7→V7) before final tonic. */
const tagPenult: CadenceDef = {
  id: 'tag_penult',
  label: 'Tag penultimate',
  shortTeach: 'The last strong beat before a tag tonic usually wants V7 (or II7→V7), not an early I.',
  glossaryIds: ['tension_release', 'bs7'],
  priority: 2,
  matchContext(ctx) {
    if (ctx.phraseRole !== 'tag') return miss()
    const n = nextDeg(ctx)
    if (n === 0 || (ctx.nextPillarRoot != null && pc(ctx.nextPillarRoot) === tonicPc(ctx))) {
      return hit(0.8)
    }
    return hit(0.4)
  },
  boostCandidate(cand, ctx) {
    const m = this.matchContext(ctx)
    if (!m.hit) return 0
    const deg = rootDeg(cand.rootPc, ctx.tonality)
    const s = m.strength
    if (isSeventhish(cand.natureId) && deg === 7) return 12 * s
    if (isSeventhish(cand.natureId) && deg === 2) return 8 * s
    if (deg === 0 && melDeg(ctx) !== 0) return -10 * s
    return 0
  },
  teachWhy() {
    return 'Tag penultimate — keep tension with V7 (or II7) before the final tonic land.'
  },
}

/** Half cadence: mid-phrase stop on V. */
const halfCad: CadenceDef = {
  id: 'half_cad',
  label: 'Half cadence',
  shortTeach: 'A mid-phrase stop often lands on V / V7 rather than forcing tonic.',
  glossaryIds: ['tension_release'],
  priority: 2,
  matchContext(ctx) {
    if (ctx.phraseRole !== 'mid') return miss()
    const n = nextDeg(ctx)
    // Local peak then rest-ish: next leaps away or missing.
    if (n == null) return hit(0.5)
    if (melDeg(ctx) === 7 || melDeg(ctx) === 2 || melDeg(ctx) === 11) return hit(0.45)
    return miss()
  },
  boostCandidate(cand, ctx) {
    const m = this.matchContext(ctx)
    if (!m.hit) return 0
    const deg = rootDeg(cand.rootPc, ctx.tonality)
    const s = m.strength
    if (deg === 7 && (isTriad(cand.natureId) || isSeventhish(cand.natureId))) return 7 * s
    if (deg === 0) return -5 * s
    return 0
  },
  teachWhy() {
    return 'Half cadence — pause on V / V7 mid-phrase instead of an early tonic close.'
  },
}

/** Optional ♭II7 → I color. */
const lightBII: CadenceDef = {
  id: 'light_bII',
  label: '♭II7→I',
  shortTeach: '♭II7 can color into tonic when the Lead supports it — never the default Detected home.',
  glossaryIds: ['secondary_dom', 'bs7'],
  priority: 3,
  matchContext(ctx) {
    const d = melDeg(ctx)
    // Melody on tones common to ♭II7 (root/3/♭7 ≈ ^♭2, ^4, ^♭1).
    if (d === 1 || d === 5 || d === 10) return hit(0.35)
    return miss()
  },
  boostCandidate(cand, ctx) {
    const m = this.matchContext(ctx)
    if (!m.hit) return 0
    if (isSeventhish(cand.natureId) && pc(cand.rootPc) === flatTwoPc(ctx)) {
      return 3.5 * m.strength
    }
    return 0
  },
  teachWhy() {
    return 'Optional ♭II7 color into I — keep it as an alternate, not the default suggestion.'
  },
}

/** Optional backdoor ♭VII7 → I. */
const backdoor: CadenceDef = {
  id: 'backdoor',
  label: '♭VII7→I',
  shortTeach: 'Backdoor ♭VII7→I is optional color when the Lead fits — not a default home.',
  glossaryIds: ['circle_fifths', 'bs7'],
  priority: 3,
  matchContext(ctx) {
    const d = melDeg(ctx)
    if (d === 10 || d === 2 || d === 5) return hit(0.3)
    return miss()
  },
  boostCandidate(cand, ctx) {
    const m = this.matchContext(ctx)
    if (!m.hit) return 0
    if (isSeventhish(cand.natureId) && pc(cand.rootPc) === flatSevenPc(ctx)) {
      return 3 * m.strength
    }
    return 0
  },
  teachWhy() {
    return 'Optional backdoor ♭VII7 into I — available as color, not the top Detected pick.'
  },
}

export const CADENCE_CATALOG: readonly CadenceDef[] = [
  authV7I,
  leadToneV7,
  circleIiVI,
  primaryDom7,
  circleFrag,
  plagalIvI,
  tagPenult,
  halfCad,
  lightBII,
  backdoor,
]

export function cadenceById(id: string): CadenceDef | undefined {
  return CADENCE_CATALOG.find((c) => c.id === id)
}

/** Prefer using tonic/dominant helpers in tests without exporting every pc. */
export const cadenceTonics = {
  tonicPc,
  dominantPc,
  subdominantPc,
  supertonicPc,
}
