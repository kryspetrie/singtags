/**
 * Lightweight phrase-role heuristic for cadence bias.
 */
import type { PhraseRole } from './types'

export type PhraseRoleInput = {
  /** Melody onset tick for this moment. */
  startTick: number
  /** Song / selection end tick (exclusive-ish). */
  endTick: number
  /** True when a rest (or gap) precedes this onset. */
  afterRest?: boolean
  /** True when a rest (or gap) follows this onset. */
  beforeRest?: boolean
  /** True when this is among the last ~1–2 strong beats of the chart/selection. */
  nearEnd?: boolean
}

/**
 * Classify open / mid / cadence / tag from local phrase shape.
 * Conservative defaults → `mid` when unclear.
 */
export function inferPhraseRole(input: PhraseRoleInput): PhraseRole {
  const { startTick, endTick } = input
  const span = Math.max(1, endTick - 0)
  const progress = startTick / span

  if (input.nearEnd || progress >= 0.92) return 'tag'
  if (input.afterRest && progress < 0.15) return 'open'
  if (input.afterRest && progress < 0.35) return 'open'
  if (input.beforeRest && progress >= 0.55) return 'cadence'
  if (input.beforeRest) return 'cadence'
  return 'mid'
}

/**
 * Build phrase role from sorted melody onset ticks around `index`.
 */
export function phraseRoleAtMelodyIndex(
  onsets: readonly { startTick: number; durationTicks: number }[],
  index: number,
  songEndTick: number,
  gapTicks = 240,
): PhraseRole {
  const cur = onsets[index]
  if (!cur) return 'mid'
  const prev = onsets[index - 1]
  const next = onsets[index + 1]
  const afterRest =
    !prev ||
    prev.startTick + Math.max(1, prev.durationTicks) + gapTicks < cur.startTick
  const beforeRest =
    !next ||
    cur.startTick + Math.max(1, cur.durationTicks) + gapTicks < next.startTick
  // Only the true last onset (or last ~8% by tick) is "near end".
  // Using length-2 made every note of a 2-beat pickup/tag read as `tag`, so
  // Lead-on-^3 openings were scored as song-final major homes instead of I7.
  const nearEnd =
    index === onsets.length - 1 || cur.startTick >= songEndTick * 0.92
  return inferPhraseRole({
    startTick: cur.startTick,
    endTick: songEndTick,
    afterRest,
    beforeRest,
    nearEnd,
  })
}
