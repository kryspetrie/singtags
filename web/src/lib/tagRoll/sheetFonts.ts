/**
 * VexFlow SMuFL / text font presets for Tag Studio sheet view.
 */
import type { TagRollSheetMusicFont, TagRollSheetTextFont } from './types'

export const SHEET_MUSIC_FONT_CHOICES: { id: TagRollSheetMusicFont; label: string; vex: string }[] =
  [
    { id: 'bravura', label: 'Bravura', vex: 'Bravura' },
    { id: 'petaluma', label: 'Petaluma', vex: 'Petaluma' },
    { id: 'leland', label: 'Leland', vex: 'Leland' },
    { id: 'gonville', label: 'Gonville', vex: 'Gonville' },
    { id: 'finale-maestro', label: 'Finale Maestro', vex: 'Finale Maestro' },
  ]

export const SHEET_TEXT_FONT_CHOICES: { id: TagRollSheetTextFont; label: string; vex: string }[] =
  [
    { id: 'academico', label: 'Academico', vex: 'Academico' },
    { id: 'petaluma-text', label: 'Petaluma Text', vex: 'Petaluma Text' },
    { id: 'leland-text', label: 'Leland Text', vex: 'Leland Text' },
    { id: 'roboto-slab', label: 'Roboto Slab', vex: 'Roboto Slab' },
    { id: 'finale-maestro-text', label: 'Finale Maestro Text', vex: 'Finale Maestro Text' },
  ]

export function normalizeSheetMusicFont(v: unknown): TagRollSheetMusicFont {
  const ids = new Set(SHEET_MUSIC_FONT_CHOICES.map((c) => c.id))
  return typeof v === 'string' && ids.has(v as TagRollSheetMusicFont)
    ? (v as TagRollSheetMusicFont)
    : 'bravura'
}

export function normalizeSheetTextFont(v: unknown): TagRollSheetTextFont {
  const ids = new Set(SHEET_TEXT_FONT_CHOICES.map((c) => c.id))
  return typeof v === 'string' && ids.has(v as TagRollSheetTextFont)
    ? (v as TagRollSheetTextFont)
    : 'academico'
}

export function vexMusicFontName(id: TagRollSheetMusicFont): string {
  return SHEET_MUSIC_FONT_CHOICES.find((c) => c.id === id)?.vex ?? 'Bravura'
}

export function vexTextFontName(id: TagRollSheetTextFont): string {
  return SHEET_TEXT_FONT_CHOICES.find((c) => c.id === id)?.vex ?? 'Academico'
}
