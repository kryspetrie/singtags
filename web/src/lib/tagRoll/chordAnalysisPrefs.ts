/**
 * Persist chord-analysis strip chrome (collapse, name/roman mode, label overrides).
 */
import type {
  ChordAnalysisMode,
  ChordAnalysisOverride,
} from '../../domain/arranging/chordAnalysisBar'

const COLLAPSED_KEY = 'singtags.labs.tagRoll.chordAnalysisCollapsed.v1'
const MODE_KEY = 'singtags.labs.tagRoll.chordAnalysisMode.v1'
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

export function loadChordAnalysisCollapsed(fallback = true): boolean {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    if (raw == null) return fallback
    return raw === '1' || raw === 'true'
  } catch {
    return fallback
  }
}

export function saveChordAnalysisCollapsed(on: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function loadChordAnalysisMode(fallback: ChordAnalysisMode = 'name'): ChordAnalysisMode {
  try {
    const raw = localStorage.getItem(MODE_KEY)
    return raw === 'roman' || raw === 'name' ? raw : fallback
  } catch {
    return fallback
  }
}

export function saveChordAnalysisMode(mode: ChordAnalysisMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    /* ignore */
  }
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
