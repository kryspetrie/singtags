/**
 * Split a scientific note name into letter / accidental / octave for stable UI.
 * Accidental slot is always reserved so naturals don't shift the letter.
 */

export type NoteAccidental = 'sharp' | 'flat' | null

export type NoteDisplayParts = {
  letter: string
  accidental: NoteAccidental
  /** ♯ / ♭ or empty string (spacer still rendered). */
  accidentalGlyph: string
  octave: number
  /** Screen-reader label, e.g. "A sharp 4". */
  spoken: string
}

const SHARP_PCS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const FLAT_PCS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const

/** Parse ASCII or Unicode scientific names (`C#4`, `Db3`, `A♯4`, `B♭2`). */
export function noteDisplayParts(name: string): NoteDisplayParts | null {
  const m = name.trim().match(/^([A-Ga-g])([#♯b♭]?)(-?\d+)$/)
  if (!m) return null
  const letter = m[1]!.toUpperCase()
  const rawAcc = m[2] ?? ''
  let accidental: NoteAccidental = null
  if (rawAcc === '#' || rawAcc === '♯') accidental = 'sharp'
  else if (rawAcc === 'b' || rawAcc === '♭') accidental = 'flat'
  const octave = Number(m[3])
  if (!Number.isFinite(octave)) return null
  return finish(letter, accidental, octave)
}

/** Build display parts from MIDI with sharp or flat spelling. */
export function noteDisplayPartsFromMidi(
  midi: number,
  preferFlats = false,
): NoteDisplayParts | null {
  if (!Number.isFinite(midi)) return null
  const m = Math.round(midi)
  if (m < 0 || m > 127) return null
  const pc = ((m % 12) + 12) % 12
  const oct = Math.floor(m / 12) - 1
  const raw = (preferFlats ? FLAT_PCS : SHARP_PCS)[pc]!
  return noteDisplayParts(`${raw}${oct}`)
}

export type FundamentalHzParts = {
  body: string
  unit: 'Hz'
  text: string
}

/** Format the strongest fundamental for the Tune readout. */
export function formatFundamentalHz(hz: number): string {
  return formatFundamentalHzParts(hz).text
}

/** Fixed-slot parts so the "Hz" unit doesn't jump as digits change. */
export function formatFundamentalHzParts(hz: number): FundamentalHzParts {
  if (!(hz > 0) || !Number.isFinite(hz)) return { body: '—', unit: 'Hz', text: '—' }
  const body = hz < 100 ? hz.toFixed(2) : hz.toFixed(1)
  return { body, unit: 'Hz', text: `${body} Hz` }
}

/** Flat-key pitch classes (number of flats in signature) — prefer ♭ spelling. */
export function preferFlatsForKeyPc(keyPc: number): boolean {
  const pc = ((Math.round(keyPc) % 12) + 12) % 12
  // F, Bb, Eb, Ab, Db, Gb
  return pc === 5 || pc === 10 || pc === 3 || pc === 8 || pc === 1 || pc === 6
}

function finish(letter: string, accidental: NoteAccidental, octave: number): NoteDisplayParts {
  const accidentalGlyph = accidental === 'sharp' ? '♯' : accidental === 'flat' ? '♭' : ''
  const spokenAcc =
    accidental === 'sharp' ? ' sharp' : accidental === 'flat' ? ' flat' : ''
  return {
    letter,
    accidental,
    accidentalGlyph,
    octave,
    spoken: `${letter}${spokenAcc} ${octave}`,
  }
}
