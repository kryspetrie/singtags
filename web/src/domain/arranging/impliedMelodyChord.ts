/**
 * Key-based implied chords for bare melody notes (no TBB sounding).
 * Heuristic only — not an Apply/Coach commitment.
 */
import { BARBERSHOP_CHORDS, leadRoleInChord, type ChordToneRole } from './chords/chords'
import { diatonicChords } from './keyChangeShared'
import { degreeOf } from './secondaryDominant'
import type { ChordStack, TonalityMode } from './types'

export type ImpliedMelodyChord = {
  rootPc: number
  natureId: string
  roman: string
  confidence: number
  leadRole: ChordToneRole
}

export type BareMelodyMoment = {
  startTick: number
  durationTicks: number
  midi: number
}

const ROLE_SCORE: Partial<Record<ChordToneRole, number>> = {
  1: 4,
  3: 3.5,
  5: 2.5,
  7: 3.2,
  9: 1.4,
  6: 1.2,
}

function functionWeight(rootDeg: number, mode: TonalityMode): number {
  if (mode === 'minor') {
    if (rootDeg === 0) return 10
    if (rootDeg === 7) return 9
    if (rootDeg === 5) return 8
    if (rootDeg === 8) return 6
    if (rootDeg === 3) return 5
    if (rootDeg === 10) return 4
    if (rootDeg === 2) return 2
    return 1
  }
  if (rootDeg === 0) return 10
  if (rootDeg === 7) return 9
  if (rootDeg === 5) return 8
  if (rootDeg === 9) return 6
  if (rootDeg === 2) return 5
  if (rootDeg === 4) return 4
  if (rootDeg === 11) return 2
  return 1
}

function romanForDiatonic(
  baseRoman: string,
  natureId: string,
  mode: TonalityMode,
): string {
  if (natureId === 'seventh' || natureId === 'ninth') {
    if (baseRoman === 'I' || baseRoman === 'i') return `${mode === 'minor' ? 'i' : 'I'}7`
    if (baseRoman === 'V') return 'V7'
    if (baseRoman === 'IV' || baseRoman === 'iv') return `${mode === 'minor' ? 'iv' : 'IV'}7`
    if (baseRoman === 'ii') return 'II7'
    return `${baseRoman}7`
  }
  if (natureId === 'm7') {
    if (baseRoman === 'ii') return 'ii7'
    if (baseRoman === 'vi' || baseRoman === 'VI') return `${baseRoman.toLowerCase()}7`
    if (baseRoman === 'iii') return 'iii7'
    if (baseRoman === 'i' || baseRoman === 'iv') return `${baseRoman}7`
  }
  return baseRoman
}

function scoreCandidate(
  rootPc: number,
  natureId: string,
  leadRole: ChordToneRole,
  tonality: number,
  mode: TonalityMode,
): number {
  const deg = degreeOf(rootPc, tonality)
  let score = functionWeight(deg, mode) * 10 + (ROLE_SCORE[leadRole] ?? 1)
  // Barbershop bias: V7 / I7 when the lead sits on 3 or 7.
  if (natureId === 'seventh' && (leadRole === 3 || leadRole === 7)) {
    if (deg === 7) score += 4
    if (deg === 0) score += 2.5
  }
  // Prefer plain triads when the lead is root or fifth of I/IV.
  if ((natureId === 'major' || natureId === 'minor') && (leadRole === 1 || leadRole === 5)) {
    if (deg === 0 || deg === 5) score += 1.5
  }
  return score
}

/**
 * Ranked diatonic (+ common BS7 color) chords that contain this melody tone.
 */
export function inferImpliedChordsFromMelody(opts: {
  melodyMidi: number
  tonality: number
  mode?: TonalityMode
  limit?: number
}): ImpliedMelodyChord[] {
  const mode = opts.mode ?? 'major'
  const limit = Math.max(1, opts.limit ?? 3)
  const diatonic = diatonicChords(opts.tonality, mode)
  type Cand = ImpliedMelodyChord & { score: number }
  const cands: Cand[] = []

  const push = (rootPc: number, natureId: string, baseRoman: string) => {
    const chord = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
    if (!chord) return
    const leadRole = leadRoleInChord(chord, rootPc, opts.melodyMidi)
    if (leadRole == null) return
    const score = scoreCandidate(rootPc, natureId, leadRole, opts.tonality, mode)
    cands.push({
      rootPc,
      natureId,
      roman: romanForDiatonic(baseRoman, natureId, mode),
      confidence: Math.min(1, score / 110),
      leadRole,
      score,
    })
  }

  for (const d of diatonic) {
    push(d.rootPc, d.natureId, d.roman)
    // Common color extensions when the melody still fits.
    if (d.natureId === 'major' && (d.deg === 0 || d.deg === 5 || d.deg === 7)) {
      push(d.rootPc, 'seventh', d.roman)
    }
    if (d.natureId === 'minor' && (d.deg === 2 || d.deg === 9 || d.deg === 0 || d.deg === 5)) {
      push(d.rootPc, 'm7', d.roman)
    }
    if (d.natureId === 'dim') {
      push(d.rootPc, 'half-dim', d.roman)
    }
  }

  cands.sort((a, b) => b.score - a.score)
  const out: ImpliedMelodyChord[] = []
  const seen = new Set<string>()
  for (const c of cands) {
    const key = `${c.rootPc}:${c.natureId}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      rootPc: c.rootPc,
      natureId: c.natureId,
      roman: c.roman,
      confidence: c.confidence,
      leadRole: c.leadRole,
    })
    if (out.length >= limit) break
  }
  return out
}

/** True when a harmony stack already accounts for this melody onset. */
export function melodyOnsetCoveredByStack(
  startTick: number,
  stacks: readonly ChordStack[],
): boolean {
  return stacks.some(
    (s) =>
      !!s.midi &&
      s.startTick <= startTick &&
      startTick < s.startTick + Math.max(1, s.durationTicks),
  )
}

/**
 * Synthetic analysis-only stacks for bare melody moments (midi null, not locked).
 */
export function impliedStacksForBareMelody(opts: {
  moments: readonly BareMelodyMoment[]
  existingStacks: readonly ChordStack[]
  tonality: number
  mode?: TonalityMode
  idPrefix?: string
}): ChordStack[] {
  const mode = opts.mode ?? 'major'
  const prefix = opts.idPrefix ?? 'implied'
  const out: ChordStack[] = []
  let n = 0
  for (const m of opts.moments) {
    if (melodyOnsetCoveredByStack(m.startTick, opts.existingStacks)) continue
    if (opts.existingStacks.some((s) => s.startTick === m.startTick && s.natureId !== 'unknown')) {
      continue
    }
    const best = inferImpliedChordsFromMelody({
      melodyMidi: m.midi,
      tonality: opts.tonality,
      mode,
      limit: 1,
    })[0]
    if (!best) continue
    out.push({
      id: `${prefix}_${n++}_${m.startTick}`,
      startTick: m.startTick,
      durationTicks: Math.max(1, m.durationTicks),
      rootPc: best.rootPc,
      natureId: best.natureId,
      voicing: '',
      spread: false,
      layer: 'primary',
      scfGroup: null,
      pillarId: null,
      midi: null,
      ruleTags: [],
    })
  }
  return out
}
