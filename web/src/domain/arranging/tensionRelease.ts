/**
 * Tension / release tagging and dominant active-tone resolution.
 * @see knowledge/17-general-theory-and-acappella.md
 */
import { BARBERSHOP_CHORDS, leadRoleInChord, type VoicingPitches } from './chords'
import { isDominantOf } from './secondaryDominant'
import type { ChordStack } from './types'

export type FunctionTag = 'tension' | 'release' | 'passing' | 'color'

export type TensionIssue = {
  id: string
  severity: 'warn' | 'info'
  message: string
  stackId?: string
  prevStackId?: string
  teachingId: string
}

const DOM_NATURES = new Set(['seventh', 'ninth'])

export function isDominantNature(natureId: string): boolean {
  return DOM_NATURES.has(natureId)
}

export function functionTagForStack(
  stack: ChordStack,
  opts?: { nextPillarRoot?: number | null; pillarRoot?: number | null },
): FunctionTag {
  if (isDominantNature(stack.natureId)) {
    const aimsNext =
      opts?.nextPillarRoot != null && isDominantOf(stack.rootPc, opts.nextPillarRoot)
    const aimsPillar =
      opts?.pillarRoot != null && isDominantOf(stack.rootPc, opts.pillarRoot)
    if (aimsNext || aimsPillar) return 'tension'
    if (stack.layer === 'passing' || (stack.scfGroup != null && stack.scfGroup > 0)) {
      return 'passing'
    }
    // Non-functional BS7/9 color (does not dominate pillar / next pillar)
    return 'color'
  }
  if (stack.natureId === 'major' || stack.natureId === 'minor') {
    if (opts?.pillarRoot != null && stack.rootPc === opts.pillarRoot) return 'release'
    return 'release'
  }
  if (stack.layer === 'passing' || (stack.scfGroup != null && stack.scfGroup > 0)) {
    return 'passing'
  }
  return 'color'
}

/** Pitch classes of chordal 3 and ♭7 for a dominant-quality stack. */
export function dominantActivePcs(rootPc: number): { third: number; seventh: number } {
  return {
    third: (((rootPc + 4) % 12) + 12) % 12,
    seventh: (((rootPc + 10) % 12) + 12) % 12,
  }
}

function pc(m: number): number {
  return ((m % 12) + 12) % 12
}

function findPartWithPc(
  midi: VoicingPitches,
  targetPc: number,
): keyof VoicingPitches | null {
  for (const k of ['bass', 'bari', 'lead', 'tenor'] as const) {
    if (pc(midi[k]) === targetPc) return k
  }
  return null
}

/**
 * Score how well next stack resolves the previous dominant's 3↑ and ♭7↓.
 * Returns 0..1 (1 = both tendencies honored or not applicable).
 */
export function resolutionScore(
  prev: { rootPc: number; natureId: string; midi: VoicingPitches },
  next: VoicingPitches,
): number {
  if (!isDominantNature(prev.natureId)) return 0.5
  const { third, seventh } = dominantActivePcs(prev.rootPc)
  const thirdPart = findPartWithPc(prev.midi, third)
  const seventhPart = findPartWithPc(prev.midi, seventh)
  let hits = 0
  let checks = 0

  if (thirdPart) {
    checks++
    const from = prev.midi[thirdPart]
    const to = next[thirdPart]
    const d = to - from
    // Leading tone wants +1 (or +13), or held if next chord still contains it
    if (d === 1 || d === 13 || pc(to) === pc(from + 1)) hits++
    else if (Math.abs(d) <= 2) hits += 0.4
  }
  if (seventhPart) {
    checks++
    const from = prev.midi[seventhPart]
    const to = next[seventhPart]
    const d = to - from
    // Active 7th wants −1
    if (d === -1 || d === -13 || pc(to) === pc(from - 1)) hits++
    else if (Math.abs(d) <= 2) hits += 0.4
  }
  if (!checks) return 0.5
  return hits / checks
}

export function checkDominantResolution(
  prev: ChordStack,
  next: ChordStack,
): TensionIssue[] {
  if (!prev.midi || !next.midi) return []
  if (!isDominantNature(prev.natureId)) return []
  const score = resolutionScore(
    { rootPc: prev.rootPc, natureId: prev.natureId, midi: prev.midi },
    next.midi,
  )
  if (score >= 0.75) return []
  return [
    {
      id: `resolve-${prev.id}-${next.id}`,
      severity: score < 0.35 ? 'warn' : 'info',
      message:
        score < 0.35
          ? 'Dominant 3rd/7th may not resolve by step into the next chord — check tension release.'
          : 'Partial resolution of the previous dominant — consider stepwise 3↑ / ♭7↓.',
      stackId: next.id,
      prevStackId: prev.id,
      teachingId: 'tension_release',
    },
  ]
}

export function analyzeTensionRelease(stacks: readonly ChordStack[]): TensionIssue[] {
  const sorted = [...stacks].sort((a, b) => a.startTick - b.startTick)
  const out: TensionIssue[] = []
  for (let i = 1; i < sorted.length; i++) {
    out.push(...checkDominantResolution(sorted[i - 1]!, sorted[i]!))
  }
  return out
}

/** 0..1 — higher when candidate is a useful tension or release given context. */
export function tensionReleaseCandidateScore(opts: {
  natureId: string
  rootPc: number
  layer: string
  nextPillarRoot: number | null
  towardPillar: boolean
}): number {
  const { natureId, rootPc, nextPillarRoot, towardPillar } = opts
  if (isDominantNature(natureId) && nextPillarRoot != null && isDominantOf(rootPc, nextPillarRoot)) {
    return 1
  }
  if (isDominantNature(natureId) && !towardPillar) return 0.65
  if ((natureId === 'major' || natureId === 'minor') && towardPillar) return 0.85
  if (natureId === 'seventh') return 0.55
  return 0.35
}

/** Lead strength on active tones for teaching labels. */
export function leadIsActiveTone(
  natureId: string,
  rootPc: number,
  leadMidi: number,
): boolean {
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  if (!chord) return false
  const role = leadRoleInChord(chord, rootPc, leadMidi)
  if (isDominantNature(natureId)) return role === 3 || role === 7
  return role === 3
}
