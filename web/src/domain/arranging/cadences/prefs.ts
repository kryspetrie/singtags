/**
 * Persist Cadence bias preference (Strong / Moderate / Off).
 */
import type { CadenceBias } from './types'

const KEY = 'singtags.tagRoll.cadenceBias'

export function scaleForBias(bias: CadenceBias): number {
  if (bias === 'off') return 0
  if (bias === 'moderate') return 0.55
  return 1
}

export function loadCadenceBias(fallback: CadenceBias = 'strong'): CadenceBias {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'strong' || v === 'moderate' || v === 'off') return v
  } catch {
    /* ignore — SSR / private mode */
  }
  return fallback
}

export function saveCadenceBias(bias: CadenceBias): void {
  try {
    localStorage.setItem(KEY, bias)
  } catch {
    /* ignore */
  }
}
