/**
 * Rhythm marks VexFlow does not infer from StaveNoteStruct alone (dots, ties).
 */
import { Dot, type Factory, type StaveNote } from 'vexflow'

export function attachNoteDots(note: StaveNote, dots: number): void {
  const n = Math.max(0, Math.floor(dots))
  for (let i = 0; i < n; i++) Dot.buildAndAttach([note], { all: true })
}

export type SheetTieAnchor = {
  note: StaveNote
  midi: number
  /** Page/system row — ties that cross systems must be split. */
  systemIndex: number
}

/**
 * Wire consecutive tied heads. Call stop before start so a middle note that
 * both ends and begins a tie closes the previous curve then opens the next.
 *
 * When start and stop fall on different systems, emit two partial ties
 * (outward from the start, inward to the stop) instead of one curve that
 * would slash across the page gap.
 */
export function connectSheetTie(
  factory: Factory,
  openTies: Map<string, SheetTieAnchor>,
  key: string,
  note: StaveNote,
  midi: number | null,
  tieStart: boolean,
  tieStop: boolean,
  systemIndex = 0,
): void {
  if (midi == null || note.isRest()) return
  if (tieStop) {
    const open = openTies.get(key)
    if (open && open.midi === midi) {
      if (open.systemIndex !== systemIndex) {
        factory.StaveTie({ from: open.note, to: null })
        factory.StaveTie({ from: null, to: note })
      } else {
        factory.StaveTie({ from: open.note, to: note })
      }
    }
    openTies.delete(key)
  }
  if (tieStart) openTies.set(key, { note, midi, systemIndex })
}
