/**
 * Persist chord-analysis lane chrome (per-lane name/roman mode, label overrides).
 */
import type {
  ChordAnalysisMode,
  ChordAnalysisOverride,
} from '../../domain/arranging/chordAnalysisBar'

/** Legacy shared mode — migrated once into declared/detected keys. */
const MODE_KEY = 'singtags.labs.tagRoll.chordAnalysisMode.v1'
const DECLARED_MODE_KEY = 'singtags.labs.tagRoll.declaredChordMode.v1'
const DETECTED_MODE_KEY = 'singtags.labs.tagRoll.detectedChordMode.v1'
const OVERRIDES_KEY = 'singtags.labs.tagRoll.chordAnalysisOverrides.v1'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore quota */
  }
}

function readMode(key: string, fallback: ChordAnalysisMode): ChordAnalysisMode {
  try {
    const raw = localStorage.getItem(key)
    return raw === 'roman' || raw === 'name' ? raw : fallback
  } catch {
    return fallback
  }
}

function writeMode(key: string, mode: ChordAnalysisMode): void {
  try {
    localStorage.setItem(key, mode)
  } catch {
    /* ignore */
  }
}

/** Legacy shared mode, used only to seed per-lane prefs once. */
export function loadChordAnalysisMode(fallback: ChordAnalysisMode = 'name'): ChordAnalysisMode {
  return readMode(MODE_KEY, fallback)
}

export function loadDeclaredChordMode(fallback: ChordAnalysisMode = 'name'): ChordAnalysisMode {
  try {
    const raw = localStorage.getItem(DECLARED_MODE_KEY)
    if (raw === 'roman' || raw === 'name') return raw
  } catch {
    /* fall through */
  }
  return loadChordAnalysisMode(fallback)
}

export function saveDeclaredChordMode(mode: ChordAnalysisMode): void {
  writeMode(DECLARED_MODE_KEY, mode)
}

export function loadDetectedChordMode(fallback: ChordAnalysisMode = 'name'): ChordAnalysisMode {
  try {
    const raw = localStorage.getItem(DETECTED_MODE_KEY)
    if (raw === 'roman' || raw === 'name') return raw
  } catch {
    /* fall through */
  }
  return loadChordAnalysisMode(fallback)
}

export function saveDetectedChordMode(mode: ChordAnalysisMode): void {
  writeMode(DETECTED_MODE_KEY, mode)
}

type OverrideBag = Record<string, Record<string, ChordAnalysisOverride>>

export function loadChordAnalysisOverrides(projectId: string): Record<string, ChordAnalysisOverride> {
  const all = readJson<OverrideBag>(OVERRIDES_KEY, {})
  return { ...(all[projectId] ?? {}) }
}

export function saveChordAnalysisOverride(
  projectId: string,
  tickKey: string,
  patch: ChordAnalysisOverride,
): Record<string, ChordAnalysisOverride> {
  const all = readJson<OverrideBag>(OVERRIDES_KEY, {})
  const cur = { ...(all[projectId] ?? {}) }
  const prev = cur[tickKey] ?? {}
  const next = { ...prev, ...patch }
  if (!next.name && !next.roman) delete cur[tickKey]
  else cur[tickKey] = next
  all[projectId] = cur
  writeJson(OVERRIDES_KEY, all)
  return cur
}
