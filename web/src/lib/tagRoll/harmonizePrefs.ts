/**
 * Persist Harmonize apply mode + workspace tab.
 * Cadence bias lives in domain/arranging/cadences/prefs.
 */
export type HarmonizeApplyMode = 'sketch' | 'stack'
export type HarmonizeWorkspace = 'pick' | 'suggest'

export type { CadenceBias } from '../../domain/arranging/cadences'
export {
  loadCadenceBias,
  saveCadenceBias,
  scaleForBias,
} from '../../domain/arranging/cadences'

const APPLY_KEY = 'singtags.tagRoll.harmonizeApplyMode'
const WORKSPACE_KEY = 'singtags.tagRoll.harmonizeWorkspace'

function normalizeApply(raw: string | null): HarmonizeApplyMode | null {
  if (raw === 'sketch' || raw === 'chord') return 'sketch'
  if (raw === 'stack' || raw === 'chord+stack') return 'stack'
  return null
}

export function loadHarmonizeApplyMode(fallback: HarmonizeApplyMode = 'stack'): HarmonizeApplyMode {
  try {
    return normalizeApply(localStorage.getItem(APPLY_KEY)) ?? fallback
  } catch {
    return fallback
  }
}

export function saveHarmonizeApplyMode(mode: HarmonizeApplyMode): void {
  try {
    localStorage.setItem(APPLY_KEY, mode)
  } catch {
    /* ignore */
  }
}

export function loadHarmonizeWorkspace(fallback: HarmonizeWorkspace = 'pick'): HarmonizeWorkspace {
  try {
    const v = localStorage.getItem(WORKSPACE_KEY)
    if (v === 'pick' || v === 'suggest') return v
  } catch {
    /* ignore */
  }
  return fallback
}

export function saveHarmonizeWorkspace(mode: HarmonizeWorkspace): void {
  try {
    localStorage.setItem(WORKSPACE_KEY, mode)
  } catch {
    /* ignore */
  }
}
