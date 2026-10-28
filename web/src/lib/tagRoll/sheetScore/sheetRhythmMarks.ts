/**
 * Rhythm marks VexFlow does not infer from StaveNoteStruct alone (dots, ties).
 */
import { Dot, type Factory, type StaveNote } from 'vexflow'

export function attachNoteDots(note: StaveNote, dots: number): void {
  const n = Math.max(0, Math.floor(dots))
  for (let i = 0; i < n; i++) Dot.buildAndAttach([note], { all: true })
}

export type SheetTieAnchor = { note: StaveNote; midi: number }

/**
 * Wire consecutive tied heads. Call stop before start so a middle note that
 * both ends and begins a tie closes the previous curve then opens the next.
 */
export function connectSheetTie(
  factory: Factory,
  openTies: Map<string, SheetTieAnchor>,
  key: string,
  note: StaveNote,
  midi: number | null,
  tieStart: boolean,
  tieStop: boolean,
): void {
  if (midi == null || note.isRest()) return
  if (tieStop) {
    const open = openTies.get(key)
    if (open && open.midi === midi) {
      factory.StaveTie({ from: open.note, to: note })
    }
    openTies.delete(key)
  }
  if (tieStart) openTies.set(key, { note, midi })
}
