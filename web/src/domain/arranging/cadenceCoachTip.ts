/**
 * Build Coach dock tip cadence hint from the selected harmonic moment.
 */
import {
  cadenceHintForContext,
  phraseRoleAtMelodyIndex,
  type CadenceHint,
} from './cadences'
import type { HarmonicMoment } from './harmonicMoments'
import type { TonalityMode } from './types'

export function cadenceHintForCoachMoment(opts: {
  moment: HarmonicMoment | null
  moments: readonly HarmonicMoment[]
  tonality: number
  mode?: TonalityMode
}): CadenceHint | null {
  const m = opts.moment
  if (!m) return null
  const sorted = opts.moments
  const idx = sorted.findIndex((x) => x.id === m.id)
  if (idx < 0) return null
  const next = sorted[idx + 1]
  const prev = idx > 0 ? sorted[idx - 1] : null
  const songEnd = sorted.reduce((max, x) => Math.max(max, x.startTick + x.durationTicks), 1)
  return cadenceHintForContext({
    tonality: opts.tonality,
    mode: opts.mode ?? 'major',
    melodyMidi: m.leadMidi,
    nextMelodyMidi: next?.leadMidi ?? null,
    prevMelodyMidi: prev?.leadMidi ?? null,
    phraseRole: phraseRoleAtMelodyIndex(
      sorted.map((x) => ({ startTick: x.startTick, durationTicks: x.durationTicks })),
      idx,
      songEnd,
    ),
  })
}
