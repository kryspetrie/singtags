/**
 * Major / minor key tonality ↔ VexFlow / UI key-signature specs.
 */
export type TonalityMode = 'major' | 'minor'

export type KeyChoice = {
  /** Display / VexFlow key spec (e.g. `Bb`, `Am`, `F#m`). */
  id: string
  /** Short label for optgroup lists (same as id for majors; minors keep `m`). */
  label: string
  tonality: number
  preferFlats: boolean
  mode: TonalityMode
  /** Accidentals in the signature (0–7). */
  accidentals: number
}

/** @deprecated Prefer KeyChoice — kept for existing imports. */
export type MajorKeyChoice = KeyChoice

/** Common major keys, circle-of-fifths order (sharps then flats). */
export const MAJOR_KEY_CHOICES: readonly KeyChoice[] = [
  { id: 'C', label: 'C major', tonality: 0, preferFlats: false, mode: 'major', accidentals: 0 },
  { id: 'G', label: 'G major', tonality: 7, preferFlats: false, mode: 'major', accidentals: 1 },
  { id: 'D', label: 'D major', tonality: 2, preferFlats: false, mode: 'major', accidentals: 2 },
  { id: 'A', label: 'A major', tonality: 9, preferFlats: false, mode: 'major', accidentals: 3 },
  { id: 'E', label: 'E major', tonality: 4, preferFlats: false, mode: 'major', accidentals: 4 },
  { id: 'B', label: 'B major', tonality: 11, preferFlats: false, mode: 'major', accidentals: 5 },
  { id: 'F#', label: 'F♯ major', tonality: 6, preferFlats: false, mode: 'major', accidentals: 6 },
  { id: 'C#', label: 'C♯ major', tonality: 1, preferFlats: false, mode: 'major', accidentals: 7 },
  { id: 'F', label: 'F major', tonality: 5, preferFlats: true, mode: 'major', accidentals: 1 },
  { id: 'Bb', label: 'B♭ major', tonality: 10, preferFlats: true, mode: 'major', accidentals: 2 },
  { id: 'Eb', label: 'E♭ major', tonality: 3, preferFlats: true, mode: 'major', accidentals: 3 },
  { id: 'Ab', label: 'A♭ major', tonality: 8, preferFlats: true, mode: 'major', accidentals: 4 },
  { id: 'Db', label: 'D♭ major', tonality: 1, preferFlats: true, mode: 'major', accidentals: 5 },
  { id: 'Gb', label: 'G♭ major', tonality: 6, preferFlats: true, mode: 'major', accidentals: 6 },
  { id: 'Cb', label: 'C♭ major', tonality: 11, preferFlats: true, mode: 'major', accidentals: 7 },
] as const

/**
 * Relative minors of {@link MAJOR_KEY_CHOICES} (same signatures).
 * Tonic = major tonic − 3 semitones.
 */
export const MINOR_KEY_CHOICES: readonly KeyChoice[] = [
  { id: 'Am', label: 'A minor', tonality: 9, preferFlats: false, mode: 'minor', accidentals: 0 },
  { id: 'Em', label: 'E minor', tonality: 4, preferFlats: false, mode: 'minor', accidentals: 1 },
  { id: 'Bm', label: 'B minor', tonality: 11, preferFlats: false, mode: 'minor', accidentals: 2 },
  { id: 'F#m', label: 'F♯ minor', tonality: 6, preferFlats: false, mode: 'minor', accidentals: 3 },
  { id: 'C#m', label: 'C♯ minor', tonality: 1, preferFlats: false, mode: 'minor', accidentals: 4 },
  { id: 'G#m', label: 'G♯ minor', tonality: 8, preferFlats: false, mode: 'minor', accidentals: 5 },
  { id: 'D#m', label: 'D♯ minor', tonality: 3, preferFlats: false, mode: 'minor', accidentals: 6 },
  { id: 'A#m', label: 'A♯ minor', tonality: 10, preferFlats: false, mode: 'minor', accidentals: 7 },
  { id: 'Dm', label: 'D minor', tonality: 2, preferFlats: true, mode: 'minor', accidentals: 1 },
  { id: 'Gm', label: 'G minor', tonality: 7, preferFlats: true, mode: 'minor', accidentals: 2 },
  { id: 'Cm', label: 'C minor', tonality: 0, preferFlats: true, mode: 'minor', accidentals: 3 },
  { id: 'Fm', label: 'F minor', tonality: 5, preferFlats: true, mode: 'minor', accidentals: 4 },
  { id: 'Bbm', label: 'B♭ minor', tonality: 10, preferFlats: true, mode: 'minor', accidentals: 5 },
  { id: 'Ebm', label: 'E♭ minor', tonality: 3, preferFlats: true, mode: 'minor', accidentals: 6 },
  { id: 'Abm', label: 'A♭ minor', tonality: 8, preferFlats: true, mode: 'minor', accidentals: 7 },
] as const

/** All selectable keys (majors then minors). */
export const KEY_CHOICES: readonly KeyChoice[] = [...MAJOR_KEY_CHOICES, ...MINOR_KEY_CHOICES]

/** VexFlow `addKeySignature` spec for project tonality + spelling + mode. */
export function vexKeySpec(
  tonality: number,
  preferFlats: boolean,
  mode: TonalityMode = 'major',
): string {
  const pc = ((Math.round(tonality) % 12) + 12) % 12
  const pool = mode === 'minor' ? MINOR_KEY_CHOICES : MAJOR_KEY_CHOICES
  const match = pool.find((k) => k.tonality === pc && k.preferFlats === preferFlats)
  if (match) return match.id
  const candidates = pool.filter((k) => k.tonality === pc)
  if (!candidates.length) return mode === 'minor' ? 'Am' : 'C'
  return candidates.sort((a, b) => a.accidentals - b.accidentals)[0]!.id
}

/** @deprecated Use {@link vexKeySpec}. */
export function vexMajorKeySpec(tonality: number, preferFlats: boolean): string {
  return vexKeySpec(tonality, preferFlats, 'major')
}

/** Select value encoding for key dropdowns. */
export function keyChoiceId(
  tonality: number,
  preferFlats: boolean,
  mode: TonalityMode = 'major',
): string {
  return vexKeySpec(tonality, preferFlats, mode)
}

/** @deprecated Use {@link keyChoiceId}. */
export function majorKeyChoiceId(tonality: number, preferFlats: boolean): string {
  return keyChoiceId(tonality, preferFlats, 'major')
}

export function keyChoiceById(id: string): KeyChoice | null {
  return KEY_CHOICES.find((k) => k.id === id) ?? null
}

/** @deprecated Use {@link keyChoiceById}. */
export function majorKeyChoiceById(id: string): KeyChoice | null {
  return keyChoiceById(id)
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
