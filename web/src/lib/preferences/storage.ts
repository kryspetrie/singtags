import { normalizeCustomParts } from '../audioParts'

/** Read a boolean flag from localStorage (`1`/`0`, `true`/`false`). */
export function loadBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw === '1' || raw === 'true') return true
    if (raw === '0' || raw === 'false') return false
  } catch {
    /* ignore */
  }
  return fallback
}

export function loadNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    const n = Number(raw)
    return Number.isFinite(n) ? n : fallback
  } catch {
    return fallback
  }
}

export function loadString(key: string, fallback: string): string {
  try {
    const raw = localStorage.getItem(key)
    return raw == null || raw === '' ? fallback : raw
  } catch {
    return fallback
  }
}

/** Read a string array from localStorage JSON; normalizes custom audio part names. */
export function loadStringArray(key: string, fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return fallback
    return normalizeCustomParts(parsed.filter((v) => typeof v === 'string') as string[])
  } catch {
    return fallback
  }
}
