/**
 * Pure helpers for MusicXML pitch / measure math (ported from SingTags Tag Studio).
 */
export function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

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

export function measureTicks(ppq: number, numerator: number, denominator: number): number {
  return Math.max(1, Math.round((numerator * ppq * 4) / denominator))
}

export type ScoreNote = {
  midi: number
  startTick: number
  durationTicks: number
  lyric?: string
  chordSymbol?: string
}

export type ScorePart = {
  id: string
  name: string
  /** MusicXML clef: G, F, or G with octave-shift. */
  clef: 'treble' | 'treble8vb' | 'bass'
  notes: ScoreNote[]
}

export type ArrangementScoreModel = {
  title: string
  bpm: number
  ppq: number
  preferFlats: boolean
  timeSignature: { numerator: number; denominator: number }
  lengthTicks: number
  parts: ScorePart[]
  /** Chord symbols keyed by onset tick (attached to lead part). */
  chordSymbols: { tick: number; text: string }[]
}
