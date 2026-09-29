/**
 * Hold-to-hear / preview for Coach theory alts (same gesture as ranked chords).
 */
import type { HarmonizeCandidate } from '../../domain/arranging/harmonize'
import {
  pickCandidateForAltChip,
  type AltChipDto,
  type CounterpartDto,
} from './CoachAlternates'

export function findCounterpartCandidate(
  candidates: readonly HarmonizeCandidate[],
  cp: CounterpartDto | null,
): HarmonizeCandidate | null {
  if (!cp) return null
  return (
    candidates.find((c) => c.rootPc === cp.toRootPc && c.natureId === cp.natureId) ??
    candidates.find((c) => c.rootPc === cp.toRootPc) ??
    null
  )
}

export function makeCoachInsightHear(opts: {
  getCandidates: () => readonly HarmonizeCandidate[]
  getCounterpart: () => CounterpartDto | null
  preview: (c: HarmonizeCandidate) => void
  holdStart: (c: HarmonizeCandidate) => void
}) {
  function previewAltChip(chip: AltChipDto): void {
    const hit = pickCandidateForAltChip(opts.getCandidates(), chip)
    if (hit) opts.preview(hit)
  }
  function holdStartAltChip(chip: AltChipDto): void {
    const hit = pickCandidateForAltChip(opts.getCandidates(), chip)
    if (hit) opts.holdStart(hit)
  }
  function previewCounterpartCand(): void {
    const hit = findCounterpartCandidate(opts.getCandidates(), opts.getCounterpart())
    if (hit) opts.preview(hit)
  }
  function holdStartCounterpartCand(): void {
    const hit = findCounterpartCandidate(opts.getCandidates(), opts.getCounterpart())
    if (hit) opts.holdStart(hit)
  }
  return {
    previewAltChip,
    holdStartAltChip,
    previewCounterpartCand,
    holdStartCounterpartCand,
  }
}
