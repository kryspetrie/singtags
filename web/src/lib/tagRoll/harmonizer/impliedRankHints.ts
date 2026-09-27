/**
 * Build pick-list rank hints from implied-melody + cadence analysis.
 */
import { absoluteChordLabel } from '../../../domain/arranging/chordAnalysisBar'
import {
  inferImpliedChordsFromMelody,
  reorderImpliedByMelodyRole,
  type MelodyRoleBias,
} from '../../../domain/arranging/impliedMelodyChord'
import type { CadenceBias, PhraseRole } from '../../../domain/arranging/cadences'
import type { TonalityMode } from '../../../domain/arranging/types'
import { rankHintsFromCandidates, type ChordRankHint } from './chordPickOptions'

export type { MelodyRoleBias }

export function impliedRankHintsAtMelody(opts: {
  melodyMidi: number
  nextMelodyMidi?: number | null
  prevMelodyMidi?: number | null
  prevRootPc?: number | null
  prevNatureId?: string | null
  phraseRole?: PhraseRole
  tonality: number
  mode?: TonalityMode
  preferFlats: boolean
  limit?: number
  cadenceBias?: CadenceBias
  /** Passing melody → prefer color / SCF-leaning natures in the hint order. */
  melodyRole?: MelodyRoleBias
}): ChordRankHint[] {
  const mode = opts.mode ?? 'major'
  const inferred = inferImpliedChordsFromMelody({
    melodyMidi: opts.melodyMidi,
    tonality: opts.tonality,
    mode,
    limit: opts.limit ?? 3,
    nextMelodyMidi: opts.nextMelodyMidi ?? null,
    prevMelodyMidi: opts.prevMelodyMidi ?? null,
    prevRootPc: opts.prevRootPc ?? null,
    prevNatureId: opts.prevNatureId ?? null,
    phraseRole: opts.phraseRole,
    cadenceBias: opts.cadenceBias,
  })
  const ranked = reorderImpliedByMelodyRole(inferred, opts.melodyRole)
  if (!ranked.length) return []
  return rankHintsFromCandidates(
    ranked.map((c) => ({
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
