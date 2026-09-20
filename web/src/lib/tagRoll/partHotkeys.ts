/**
 * Part-select hotkeys for Tag Studio (default TLRB + custom extras).
 */
import type { TagRollPart } from './types'

/** Keys reserved by editor shortcuts — cannot be assigned as part hotkeys. */
export const TAG_ROLL_RESERVED_HOTKEYS = new Set([
  'v',
  'e',
  'y', // lyrics mode (L is Lead)
  'c', // cycle active part
  's', // stop
  'h', // hear stack
  'm', // harmonize
  ' ',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '[',
  ']',
  ',',
  '.',
])

const DEFAULT_BY_NAME: Record<string, string> = {
  tenor: 't',
  lead: 'l',
  bari: 'r',
  baritone: 'r',
  bass: 'b',
}

/** Prior defaults (Lead=D, Bari=B, Bass=A) — rewrite on load so TLRB takes effect. */
const LEGACY_DEFAULT_BY_NAME: Record<string, string> = {
  lead: 'd',
  bari: 'b',
  baritone: 'b',
  bass: 'a',
}

export function normalizePartHotkey(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const k = raw.trim().toLowerCase()
  if (!/^[a-z]$/.test(k)) return undefined
  if (TAG_ROLL_RESERVED_HOTKEYS.has(k)) return undefined
  return k
}

export function defaultHotkeyForPartName(name: string): string | undefined {
  return DEFAULT_BY_NAME[name.trim().toLowerCase()]
}

/** Map a stored hotkey onto TLRB when it still matches the old D/B/A defaults. */
export function migratePartHotkey(
  name: string,
  hotkey: string | undefined,
): string | undefined {
  const key = name.trim().toLowerCase()
  const next = DEFAULT_BY_NAME[key]
  const legacy = LEGACY_DEFAULT_BY_NAME[key]
  if (next && legacy && hotkey === legacy) return next
  return hotkey
}

/** Resolve which part a key should select (explicit hotkey, else TLRB defaults). */
export function findPartByHotkey(
  parts: readonly TagRollPart[],
  key: string,
): TagRollPart | null {
  const k = key.toLowerCase()
  if (!/^[a-z]$/.test(k) || TAG_ROLL_RESERVED_HOTKEYS.has(k)) return null
  const explicit = parts.find((p) => (p.hotkey || '').toLowerCase() === k)
  if (explicit) return explicit
  for (const p of parts) {
    if (p.hotkey) continue // only fall back for parts without an override
    const def = defaultHotkeyForPartName(p.name)
    if (def === k) return p
  }
  return null
}

export function displayHotkeyForPart(part: TagRollPart): string | null {
  const explicit = normalizePartHotkey(part.hotkey)
  if (explicit) return explicit.toUpperCase()
  const def = defaultHotkeyForPartName(part.name)
  return def ? def.toUpperCase() : null
}
