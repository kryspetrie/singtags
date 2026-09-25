/**
 * Build pick-list rank hints from implied-melody + cadence analysis.
 */
import { absoluteChordLabel } from '../../../domain/arranging/chordAnalysisBar'
import { inferImpliedChordsFromMelody } from '../../../domain/arranging/impliedMelodyChord'
import type { TonalityMode } from '../../../domain/arranging/types'
import { rankHintsFromCandidates, type ChordRankHint } from './chordPickOptions'

export function impliedRankHintsAtMelody(opts: {
  melodyMidi: number
  nextMelodyMidi?: number | null
  tonality: number
  mode?: TonalityMode
  preferFlats: boolean
  limit?: number
}): ChordRankHint[] {
  const mode = opts.mode ?? 'major'
  const inferred = inferImpliedChordsFromMelody({
    melodyMidi: opts.melodyMidi,
    tonality: opts.tonality,
    mode,
    limit: opts.limit ?? 3,
    nextMelodyMidi: opts.nextMelodyMidi ?? null,
  })
  if (!inferred.length) return []
  return rankHintsFromCandidates(
    inferred.map((c) => ({
      rootPc: c.rootPc,
      natureId: c.natureId,
      label: absoluteChordLabel(c.rootPc, c.natureId, opts.preferFlats, {
        tonality: opts.tonality,
        tonalityMode: mode,
      }),
      cadenceLabel: c.cadenceHint?.label,
    })),
  )
}
