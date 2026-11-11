/**
 * Map a detected frequency to nearest equal-temperament note + cents error vs A4.
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export type NoteFromHz = {
  name: string
  midi: number
  /** Signed cents vs the equal-temperament pitch at `a4Hz`. */
  cents: number
  targetHz: number
}

/** Nearest 12-TET note for `hz` given concert A. */
export function noteFromHz(hz: number, a4Hz = 440): NoteFromHz | null {
  if (!(hz > 0) || !(a4Hz > 0)) return null
  const midiFloat = 69 + 12 * Math.log2(hz / a4Hz)
  const midi = Math.round(midiFloat)
  if (midi < 0 || midi > 127) return null
  const cents = (midiFloat - midi) * 100
  const pc = ((midi % 12) + 12) % 12
  const oct = Math.floor(midi / 12) - 1
  const targetHz = a4Hz * 2 ** ((midi - 69) / 12)
  return {
    name: `${NOTE_NAMES[pc]!}${oct}`,
    midi,
    cents,
    targetHz,
  }
}
