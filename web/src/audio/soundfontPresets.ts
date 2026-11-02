/**
 * SoundFont instrument (MIDI patch) catalogs + favorites keys.
 * Piano-only banks have a single implicit patch; multi banks ship a JSON list.
 */
import yamahaXgCatalog from './soundfontPresets/yamaha-xg.json'
import type { TagRollSoundfontId } from './soundfonts'

export type TagRollSoundfontPatch = {
  bankMSB: number
  bankLSB: number
  program: number
}

export type TagRollSoundfontPreset = TagRollSoundfontPatch & {
  name: string
  drum?: boolean
}

export const TAG_ROLL_DEFAULT_SOUNDFONT_PATCH: TagRollSoundfontPatch = {
  bankMSB: 0,
  bankLSB: 0,
  program: 0,
}

export function soundfontPatchKey(p: TagRollSoundfontPatch): string {
  return `${p.bankMSB | 0}:${p.bankLSB | 0}:${p.program | 0}`
}

export function parseSoundfontPatchKey(raw: unknown): TagRollSoundfontPatch | null {
  if (typeof raw !== 'string') return null
  const m = raw.trim().match(/^(\d{1,3}):(\d{1,3}):(\d{1,3})$/)
  if (!m) return null
  const bankMSB = Number(m[1])
  const bankLSB = Number(m[2])
  const program = Number(m[3])
  if (
    !Number.isInteger(bankMSB) ||
    !Number.isInteger(bankLSB) ||
    !Number.isInteger(program) ||
    bankMSB < 0 ||
    bankMSB > 127 ||
    bankLSB < 0 ||
    bankLSB > 127 ||
    program < 0 ||
    program > 127
  ) {
    return null
  }
  return { bankMSB, bankLSB, program }
}

export function normalizeSoundfontPatch(raw: unknown): TagRollSoundfontPatch {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    const bankMSB = Math.round(Number(o.bankMSB))
    const bankLSB = Math.round(Number(o.bankLSB))
    const program = Math.round(Number(o.program))
    if (
      Number.isFinite(bankMSB) &&
      Number.isFinite(bankLSB) &&
      Number.isFinite(program) &&
      bankMSB >= 0 &&
      bankMSB <= 127 &&
      bankLSB >= 0 &&
      bankLSB <= 127 &&
      program >= 0 &&
      program <= 127
    ) {
      return { bankMSB, bankLSB, program }
    }
  }
  if (typeof raw === 'string') {
    return parseSoundfontPatchKey(raw) ?? { ...TAG_ROLL_DEFAULT_SOUNDFONT_PATCH }
  }
  return { ...TAG_ROLL_DEFAULT_SOUNDFONT_PATCH }
}

export function patchesEqual(a: TagRollSoundfontPatch, b: TagRollSoundfontPatch): boolean {
  return a.bankMSB === b.bankMSB && a.bankLSB === b.bankLSB && a.program === b.program
}

/** Favorite key is bank-scoped so the same GM program can be starred per SoundFont. */
export function soundfontFavoriteKey(
  soundfontId: TagRollSoundfontId,
  patch: TagRollSoundfontPatch,
): string {
  return `${soundfontId}|${soundfontPatchKey(patch)}`
}

export function parseSoundfontFavoriteKey(
  raw: string,
): { soundfontId: string; patch: TagRollSoundfontPatch } | null {
  const sep = raw.indexOf('|')
  if (sep <= 0) return null
  const soundfontId = raw.slice(0, sep)
  const patch = parseSoundfontPatchKey(raw.slice(sep + 1))
  if (!soundfontId || !patch) return null
  return { soundfontId, patch }
}

const GM_FAMILY_LABELS: { maxProgram: number; label: string }[] = [
  { maxProgram: 7, label: 'Piano' },
  { maxProgram: 15, label: 'Chromatic percussion' },
  { maxProgram: 23, label: 'Organ' },
  { maxProgram: 31, label: 'Guitar' },
  { maxProgram: 39, label: 'Bass' },
  { maxProgram: 47, label: 'Strings' },
  { maxProgram: 55, label: 'Ensemble' },
  { maxProgram: 63, label: 'Brass' },
  { maxProgram: 71, label: 'Reed' },
  { maxProgram: 79, label: 'Pipe' },
  { maxProgram: 87, label: 'Synth lead' },
  { maxProgram: 95, label: 'Synth pad' },
  { maxProgram: 103, label: 'Synth effects' },
  { maxProgram: 111, label: 'Ethnic' },
  { maxProgram: 119, label: 'Percussive' },
  { maxProgram: 127, label: 'Sound effects' },
]

export function gmFamilyLabel(program: number): string {
  const p = Math.max(0, Math.min(127, program | 0))
  for (const row of GM_FAMILY_LABELS) {
    if (p <= row.maxProgram) return row.label
  }
  return 'Other'
}

type CatalogFile = {
  soundfontId: string
  label: string
  presets: TagRollSoundfontPreset[]
}

const CATALOGS: Partial<Record<TagRollSoundfontId, CatalogFile>> = {
  'yamaha-xg': yamahaXgCatalog as CatalogFile,
}

/** Presets for a multi-instrument bank (empty → treat as single piano patch). */
export function soundfontPresetsFor(id: TagRollSoundfontId): TagRollSoundfontPreset[] {
  return CATALOGS[id]?.presets ?? []
}

export function soundfontHasInstrumentPicker(id: TagRollSoundfontId): boolean {
  return soundfontPresetsFor(id).length > 1
}

export function findSoundfontPreset(
  id: TagRollSoundfontId,
  patch: TagRollSoundfontPatch,
): TagRollSoundfontPreset | null {
  const list = soundfontPresetsFor(id)
  if (!list.length) {
    if (patchesEqual(patch, TAG_ROLL_DEFAULT_SOUNDFONT_PATCH)) {
      return { ...TAG_ROLL_DEFAULT_SOUNDFONT_PATCH, name: 'Piano' }
    }
    return null
  }
  return list.find((p) => patchesEqual(p, patch)) ?? null
}

export function clampSoundfontPatchToBank(
  id: TagRollSoundfontId,
  patch: TagRollSoundfontPatch,
): TagRollSoundfontPatch {
  const list = soundfontPresetsFor(id)
  if (!list.length) return { ...TAG_ROLL_DEFAULT_SOUNDFONT_PATCH }
  if (list.some((p) => patchesEqual(p, patch))) return { ...patch }
  const first = list[0]!
  return { bankMSB: first.bankMSB, bankLSB: first.bankLSB, program: first.program }
}

export type SoundfontPresetGroup = {
  label: string
  presets: TagRollSoundfontPreset[]
}

/** Group presets for `<select>` optgroups (favorites handled by the UI). */
export function groupSoundfontPresets(presets: readonly TagRollSoundfontPreset[]): SoundfontPresetGroup[] {
  const melodicBank0: TagRollSoundfontPreset[] = []
  const variations: TagRollSoundfontPreset[] = []
  const drums: TagRollSoundfontPreset[] = []
  for (const p of presets) {
    if (p.drum) drums.push(p)
    else if (p.bankMSB === 0 && p.bankLSB === 0) melodicBank0.push(p)
    else variations.push(p)
  }
  const groups: SoundfontPresetGroup[] = []
  if (melodicBank0.length) {
    const byFamily = new Map<string, TagRollSoundfontPreset[]>()
    for (const p of melodicBank0) {
      const label = gmFamilyLabel(p.program)
      const arr = byFamily.get(label) ?? []
      arr.push(p)
      byFamily.set(label, arr)
    }
    for (const [label, list] of byFamily) {
      groups.push({ label, presets: list })
    }
  }
  if (variations.length) groups.push({ label: 'Variations / banks', presets: variations })
  if (drums.length) groups.push({ label: 'Drum kits', presets: drums })
  return groups
}
