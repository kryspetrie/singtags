/**
 * Persist Harmonize apply mode + workspace tab + chord label mode.
 * Cadence bias lives in domain/arranging/cadences/prefs.
 * Chord label mode is shared with Coach Choose buttons.
 */
export type HarmonizeApplyMode = 'sketch' | 'stack'
export type HarmonizeWorkspace = 'pick' | 'suggest'
/** Letter names (G7) vs Roman numerals (V7) on Harmonize / Coach chord buttons. */
export type ChordPickLabelMode = 'name' | 'roman'

export type { CadenceBias } from '../../domain/arranging/cadences'
export {
  loadCadenceBias,
  saveCadenceBias,
  scaleForBias,
} from '../../domain/arranging/cadences'

const APPLY_KEY = 'singtags.tagRoll.harmonizeApplyMode'
const WORKSPACE_KEY = 'singtags.tagRoll.harmonizeWorkspace'
const LABEL_MODE_KEY = 'singtags.tagRoll.harmonizeChordLabelMode'
const MELODY_FILTER_KEY = 'singtags.tagRoll.harmonizeMelodyFilter'

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

export function loadHarmonizeWorkspace(fallback: HarmonizeWorkspace = 'suggest'): HarmonizeWorkspace {
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

export function loadChordPickLabelMode(fallback: ChordPickLabelMode = 'name'): ChordPickLabelMode {
  try {
    const v = localStorage.getItem(LABEL_MODE_KEY)
    if (v === 'name' || v === 'roman') return v
  } catch {
    /* ignore */
  }
  return fallback
}

export function saveChordPickLabelMode(mode: ChordPickLabelMode): void {
  try {
    localStorage.setItem(LABEL_MODE_KEY, mode)
  } catch {
    /* ignore */
  }
}

/**
 * When true (default), Harmonize greys/disables chords that do not contain the
 * current melody note. Turn off to browse the full catalog equally.
 */
export function loadHarmonizeMelodyFilter(fallback = true): boolean {
  try {
    const v = localStorage.getItem(MELODY_FILTER_KEY)
    if (v === '0' || v === 'false') return false
    if (v === '1' || v === 'true') return true
  } catch {
    /* ignore */
  }
  return fallback
}

export function saveHarmonizeMelodyFilter(on: boolean): void {
  try {
    localStorage.setItem(MELODY_FILTER_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}
