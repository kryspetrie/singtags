/**
 * Shared `?shift=` parsing for Tag / My Library song pages.
 */
import type { LocationQuery } from 'vue-router'
import { clampPitchSemitones } from '../audio/pitchUiLabels'

/** Read clamped pitch-shift semitones from a route query (`shift`). */
export function readPitchShiftFromQuery(query: LocationQuery): number {
  const raw = query.shift
  if (typeof raw !== 'string' || raw === '') return 0
  const n = Number(raw)
  return Number.isFinite(n) ? clampPitchSemitones(n) : 0
}
