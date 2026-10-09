/**
 * Table-driven Strong-note root priors (offline-fitted on polecat charts).
 * Runtime Auto Coach never sees chart roots — only this compact table.
 */
import { STRONG_ROOT_PRIOR_TABLE } from './strongRootPriors.generated'

export type StrongPriorContext = {
  scaleDegree: number
  prevHomeDeg: number | null
  nextBareDeg: number | null
  phraseEdge: 'start' | 'end' | null
  beatInBar: number
  /** eighth | quarter | longer */
  durationBucket?: 'e' | 'q' | 'l'
  /** step | leap */
  intervalClass?: 's' | 'L' | 'x'
  /** bars from phrase start: 0 | 1 | 2+ */
  barsFromPhraseStart?: '0' | '1' | '2'
}

function edgeCode(edge: 'start' | 'end' | null): string {
  if (edge === 'start') return 's'
  if (edge === 'end') return 'e'
  return 'm'
}

export function durationBucket(durationTicks: number, ppq: number): 'e' | 'q' | 'l' {
  if (durationTicks < ppq / 2) return 'e'
  if (durationTicks < ppq * 1.5) return 'q'
  return 'l'
}

export function intervalClass(prevMidi: number | null, midi: number): 's' | 'L' | 'x' {
  if (prevMidi == null) return 'x'
  return Math.abs(midi - prevMidi) <= 2 ? 's' : 'L'
}

export function barsFromPhraseStart(
  noteTick: number,
  phraseStartTick: number,
  barTicks: number,
): '0' | '1' | '2' {
  const bars = Math.floor((noteTick - phraseStartTick) / Math.max(1, barTicks))
  if (bars <= 0) return '0'
  if (bars === 1) return '1'
  return '2'
}

/** Bare I/IV/V map (fallback when table misses). */
export function bareMajorHomeDeg(sd: number): number | null {
  if (sd === 0 || sd === 4 || sd === 7) return 0
  if (sd === 5 || sd === 9) return 5
  if (sd === 2 || sd === 11) return 7
  if (sd === 3 || sd === 8) return 0
  return null
}

/**
 * Lookup fitted home degree. Tries specific keys then falls back.
 */
export function lookupStrongRootPrior(ctx: StrongPriorContext): number | null {
  const sd = ctx.scaleDegree
  const p = ctx.prevHomeDeg != null ? String(ctx.prevHomeDeg) : 'x'
  const n = ctx.nextBareDeg != null ? String(ctx.nextBareDeg) : 'x'
  const e = edgeCode(ctx.phraseEdge)
  const b = ((ctx.beatInBar % 4) + 4) % 4
  const d = ctx.durationBucket ?? 'q'
  const iv = ctx.intervalClass ?? 'x'
  const f = ctx.barsFromPhraseStart ?? '0'
  const keys = [
    `sd${sd}|p${p}|n${n}|${e}|b${b}|d${d}|i${iv}|f${f}`,
    `sd${sd}|p${p}|${e}|d${d}|i${iv}`,
    `sd${sd}|p${p}|${e}|d${d}`,
    `sd${sd}|p${p}|n${n}|${e}|b${b}`,
    `sd${sd}|p${p}|n${n}|${e}`,
    `sd${sd}|p${p}|${e}|f${f}`,
    `sd${sd}|p${p}|${e}`,
    `sd${sd}|p${p}|d${d}`,
    `sd${sd}|p${p}`,
    `sd${sd}|${e}|f${f}`,
    `sd${sd}|${e}`,
  ]
  for (const key of keys) {
    const hit = STRONG_ROOT_PRIOR_TABLE[key]
    if (hit != null) return hit
  }
  return null
}

export { STRONG_ROOT_PRIOR_TABLE }
