/**
 * Session preference for the ratio used when dragging a new tuplet span.
 */
import { TUPLET_PRESETS, type TupletRatio } from './tupletContainers'

const STORAGE_KEY = 'tagRoll.tupletCreateRatio.v1'

export function defaultTupletCreateRatio(): TupletRatio {
  return { ...TUPLET_PRESETS.triplet }
}

export function clampTupletCreateRatio(raw: Partial<TupletRatio> | null | undefined): TupletRatio {
  const actualNotes = Math.max(2, Math.min(16, Math.round(Number(raw?.actualNotes) || 3)))
  const normalNotes = Math.max(1, Math.min(16, Math.round(Number(raw?.normalNotes) || 2)))
  return { actualNotes, normalNotes }
}

export function loadTupletCreateRatio(): TupletRatio {
  if (typeof sessionStorage === 'undefined') return defaultTupletCreateRatio()
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultTupletCreateRatio()
    return clampTupletCreateRatio(JSON.parse(raw) as Partial<TupletRatio>)
  } catch {
    return defaultTupletCreateRatio()
  }
}

export function saveTupletCreateRatio(ratio: TupletRatio): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(clampTupletCreateRatio(ratio)))
  } catch {
    /* ignore quota / private mode */
  }
}

export function tupletCreatePresetKey(
  ratio: TupletRatio,
): keyof typeof TUPLET_PRESETS | 'custom' {
  for (const key of Object.keys(TUPLET_PRESETS) as (keyof typeof TUPLET_PRESETS)[]) {
    const p = TUPLET_PRESETS[key]
    if (p.actualNotes === ratio.actualNotes && p.normalNotes === ratio.normalNotes) return key
  }
  return 'custom'
}

export function formatTupletRatio(ratio: TupletRatio): string {
  return `${ratio.actualNotes}:${ratio.normalNotes}`
}
