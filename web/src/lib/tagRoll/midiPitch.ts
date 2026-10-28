/**
 * MIDI ↔ step/alter/octave without project or chord context.
 * Chord-aware spelling lives in sheetScore/sheetPitchSpelling.ts.
 */

/** MIDI → step/alter/octave (preferFlats chooses sharp vs flat spelling). */
export function midiToMusicXmlPitch(
  midi: number,
  preferFlats: boolean,
): { step: string; alter: number; octave: number } {
  const n = Math.max(0, Math.min(127, Math.round(midi)))
  const pc = ((n % 12) + 12) % 12
  const octave = Math.floor(n / 12) - 1
  const sharp: Array<[string, number]> = [
    ['C', 0],
    ['C', 1],
    ['D', 0],
    ['D', 1],
    ['E', 0],
    ['F', 0],
    ['F', 1],
    ['G', 0],
    ['G', 1],
    ['A', 0],
    ['A', 1],
    ['B', 0],
  ]
  const flat: Array<[string, number]> = [
    ['C', 0],
    ['D', -1],
    ['D', 0],
    ['E', -1],
    ['E', 0],
    ['F', 0],
    ['G', -1],
    ['G', 0],
    ['A', -1],
    ['A', 0],
    ['B', -1],
    ['B', 0],
  ]
  const [step, alter] = (preferFlats ? flat : sharp)[pc]!
  return { step, alter, octave }
}

/** MusicXML `<accidental>` value for a written alter (−2…+2). */
export function musicXmlAccidentalName(alter: number): string | null {
  switch (alter) {
    case 2:
      return 'double-sharp'
    case 1:
      return 'sharp'
    case -1:
      return 'flat'
    case -2:
      return 'flat-flat'
    case 0:
      return null
    default:
      return null
  }
}
