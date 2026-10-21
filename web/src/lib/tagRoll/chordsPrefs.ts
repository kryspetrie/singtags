/**
 * Persist Chords panel apply mode + workspace tab + chord label mode.
 * Cadence bias lives in domain/arranging/cadences/prefs.
 * Chord label mode is shared with Coach Choose buttons.
 * localStorage keys keep the historical `harmonize*` names so prefs are not wiped.
 */
export type ChordsApplyMode = 'sketch' | 'stack'
export type ChordsWorkspace = 'pick' | 'suggest'
/** Letter names (G7) vs Roman numerals (V7) on Chords / Coach chord buttons. */
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

function normalizeApply(raw: string | null): ChordsApplyMode | null {
  if (raw === 'sketch' || raw === 'chord') return 'sketch'
  if (raw === 'stack' || raw === 'chord+stack') return 'stack'
  return null
}

export function loadChordsApplyMode(fallback: ChordsApplyMode = 'stack'): ChordsApplyMode {
  try {
    return normalizeApply(localStorage.getItem(APPLY_KEY)) ?? fallback
  } catch {
    return fallback
  }
}

export function saveChordsApplyMode(mode: ChordsApplyMode): void {
  try {
    localStorage.setItem(APPLY_KEY, mode)
  } catch {
    /* ignore */
  }
}

export function loadChordsWorkspace(fallback: ChordsWorkspace = 'suggest'): ChordsWorkspace {
  try {
    const v = localStorage.getItem(WORKSPACE_KEY)
    if (v === 'pick' || v === 'suggest') return v
  } catch {
    /* ignore */
  }
  return fallback
}

export function saveChordsWorkspace(mode: ChordsWorkspace): void {
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
 * When true (default), Chords greys/disables chords that do not contain the
 * current melody note. Turn off to browse the full catalog equally.
 */
export function loadChordsMelodyFilter(fallback = true): boolean {
  try {
    const v = localStorage.getItem(MELODY_FILTER_KEY)
    if (v === '0' || v === 'false') return false
    if (v === '1' || v === 'true') return true
  } catch {
    /* ignore */
  }
  return fallback
}

export function saveChordsMelodyFilter(on: boolean): void {
  try {
    localStorage.setItem(MELODY_FILTER_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}
