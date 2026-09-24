/**
 * Persist Harmonize apply mode (chord-only vs chord+stack).
 * Cadence bias lives in domain/arranging/cadences/prefs (shared Detected + Coach).
 */
export type HarmonizeApplyMode = 'chord' | 'chord+stack'

export type { CadenceBias } from '../../domain/arranging/cadences'
export {
  loadCadenceBias,
  saveCadenceBias,
  scaleForBias,
} from '../../domain/arranging/cadences'

const KEY = 'singtags.tagRoll.harmonizeApplyMode'

export function loadHarmonizeApplyMode(fallback: HarmonizeApplyMode = 'chord+stack'): HarmonizeApplyMode {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'chord' || v === 'chord+stack') return v
  } catch {
    /* ignore */
  }
  return fallback
}

export function saveHarmonizeApplyMode(mode: HarmonizeApplyMode): void {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    /* ignore */
  }
}
