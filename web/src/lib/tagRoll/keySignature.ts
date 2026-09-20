/**
 * Major-key tonality ↔ VexFlow / UI key-signature specs.
 */
export type MajorKeyChoice = {
  /** Display / VexFlow key spec (e.g. `Bb`, `F#`). */
  id: string
  tonality: number
  preferFlats: boolean
  /** Accidentals in the signature (0–7). */
  accidentals: number
}

/** Common major keys, circle-of-fifths order (sharps then flats). */
export const MAJOR_KEY_CHOICES: readonly MajorKeyChoice[] = [
  { id: 'C', tonality: 0, preferFlats: false, accidentals: 0 },
  { id: 'G', tonality: 7, preferFlats: false, accidentals: 1 },
  { id: 'D', tonality: 2, preferFlats: false, accidentals: 2 },
  { id: 'A', tonality: 9, preferFlats: false, accidentals: 3 },
  { id: 'E', tonality: 4, preferFlats: false, accidentals: 4 },
  { id: 'B', tonality: 11, preferFlats: false, accidentals: 5 },
  { id: 'F#', tonality: 6, preferFlats: false, accidentals: 6 },
  { id: 'C#', tonality: 1, preferFlats: false, accidentals: 7 },
  { id: 'F', tonality: 5, preferFlats: true, accidentals: 1 },
  { id: 'Bb', tonality: 10, preferFlats: true, accidentals: 2 },
  { id: 'Eb', tonality: 3, preferFlats: true, accidentals: 3 },
  { id: 'Ab', tonality: 8, preferFlats: true, accidentals: 4 },
  { id: 'Db', tonality: 1, preferFlats: true, accidentals: 5 },
  { id: 'Gb', tonality: 6, preferFlats: true, accidentals: 6 },
  { id: 'Cb', tonality: 11, preferFlats: true, accidentals: 7 },
] as const

/** VexFlow `addKeySignature` spec for project tonality + spelling. */
export function vexMajorKeySpec(tonality: number, preferFlats: boolean): string {
  const pc = ((Math.round(tonality) % 12) + 12) % 12
  const match = MAJOR_KEY_CHOICES.find(
    (k) => k.tonality === pc && k.preferFlats === preferFlats,
  )
  if (match) return match.id
  // Prefer the spelling with fewer accidentals when ambiguous.
  const candidates = MAJOR_KEY_CHOICES.filter((k) => k.tonality === pc)
  if (!candidates.length) return 'C'
  return candidates.sort((a, b) => a.accidentals - b.accidentals)[0]!.id
}

/** Select value encoding for key dropdowns. */
export function majorKeyChoiceId(tonality: number, preferFlats: boolean): string {
  return vexMajorKeySpec(tonality, preferFlats)
}

export function majorKeyChoiceById(id: string): MajorKeyChoice | null {
  return MAJOR_KEY_CHOICES.find((k) => k.id === id) ?? null
}

/** MIDI → scientific label honoring flat/sharp spelling. */
export function midiPitchLabel(midi: number, preferFlats: boolean): string {
  const names = preferFlats
    ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
    : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const n = Math.round(midi)
  const oct = Math.floor(n / 12) - 1
  return `${names[((n % 12) + 12) % 12]!}${oct}`
}
