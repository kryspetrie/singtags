/**
 * Approach Three root-motion rules — soft candidate ranking (not hard rejection).
 * @see knowledge/06-approach-three-rules.md
 */

export type RootMotionKind =
  | 'p5_down'
  | 'p5_up_cadential'
  | 'p5_up_retro'
  | 'chromatic'
  | 'tritone'
  | 'm3_up'
  | 'springboard'
  | 'other'

export function pcDiff(from: number, to: number): number {
  return (((to - from) % 12) + 12) % 12
}

export function isP5Down(from: number, to: number): boolean {
  return pcDiff(from, to) === 5 // down P5 = up P4 = 5 semitones up
}

export function isP5Up(from: number, to: number): boolean {
  return pcDiff(from, to) === 7
}

export function isChromaticStep(from: number, to: number): boolean {
  const d = pcDiff(from, to)
  return d === 1 || d === 11
}

export function isTritone(from: number, to: number): boolean {
  return pcDiff(from, to) === 6
}

export function isM3Up(from: number, to: number): boolean {
  return pcDiff(from, to) === 4
}

/** Barbershop / dominant Mm7 or Dom9 — unlocks R2 / R3 / R5 from this chord. */
export function isBs7Nature(natureId: string): boolean {
  return natureId === 'seventh' || natureId === 'ninth'
}

/**
 * I/i or IV/iv relative to tonality — free springboards.
 * Minor mode still treats degrees 0 and 5 as springboards (i / iv).
 */
export function isSpringboardRoot(
  rootPc: number,
  tonality: number,
  _mode?: 'major' | 'minor',
): boolean {
  const deg = pcDiff(tonality, rootPc)
  return deg === 0 || deg === 5
}

export function classifyRootMotion(opts: {
  fromRoot: number
  toRoot: number
  tonality: number
  fromIsSeventh?: boolean
  mode?: 'major' | 'minor'
}): RootMotionKind {
  const { fromRoot, toRoot, tonality, fromIsSeventh, mode } = opts
  // Circle / cadential / retro before springboard so P5-down keeps highway priority.
  if (isP5Down(fromRoot, toRoot)) return 'p5_down'
  if (isP5Up(fromRoot, toRoot)) {
    const fromDeg = pcDiff(tonality, fromRoot)
    const toDeg = pcDiff(tonality, toRoot)
    // IV/iv → I/i is cadential progression
    if (fromDeg === 5 && toDeg === 0) return 'p5_up_cadential'
    // I/i or IV/iv may leap freely — including up a P5 (e.g. I→V)
    if (isSpringboardRoot(fromRoot, tonality, mode)) return 'springboard'
    return 'p5_up_retro'
  }
  if (isSpringboardRoot(fromRoot, tonality, mode)) return 'springboard'
  if (fromIsSeventh && isChromaticStep(fromRoot, toRoot)) return 'chromatic'
  if (fromIsSeventh && isTritone(fromRoot, toRoot)) return 'tritone'
  if (fromIsSeventh && isM3Up(fromRoot, toRoot)) return 'm3_up'
  return 'other'
}

const MOTION_SCORE: Record<RootMotionKind, number> = {
  p5_down: 10,
  p5_up_cadential: 8,
  springboard: 6,
  chromatic: 5,
  tritone: 5,
  m3_up: 4,
  p5_up_retro: 3,
  other: 0,
}

export function scoreRootMotion(
  kind: RootMotionKind,
  towardPillar: boolean,
  opts?: { targetIsSeventh?: boolean },
): number {
  let score = MOTION_SCORE[kind] + (towardPillar ? 4 : 0)
  // R5 classic form: BS7 → non-seventh target (BAM Ex. 26–27). Soft-penalize M3-up into another 7/9.
  if (kind === 'm3_up' && opts?.targetIsSeventh) score -= 3
  return score
}

/**
 * Stevens / Prietto “distance from home”: how many descending-fifth (up-P4) steps
 * from `rootPc` back to tonic. IV/F-side roots are far on this metric (not “distance 1”).
 */
export function distanceFromHome(rootPc: number, tonicPc: number): number {
  let pc = ((rootPc % 12) + 12) % 12
  const home = ((tonicPc % 12) + 12) % 12
  let d = 0
  while (pc !== home && d < 12) {
    pc = (pc + 5) % 12
    d++
  }
  return d
}
