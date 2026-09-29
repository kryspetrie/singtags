/**
 * Convert NotationExample → ABC notation (pure domain, no DOM / no abcjs).
 * Staffing: Tenor+Lead on treble-8 (tenor staff); Bari+Bass on bass.
 *
 * Output is staves + notes only — titles, captions, chord labels, and voice
 * names are rendered by the Learn UI (HTML), not engraved into the SVG.
 */
import type { NotationChord, NotationExample, NotationVoice } from './types'

const PC_LETTER = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'] as const
const PC_ACC = ['', '^', '', '^', '', '', '^', '', '^', '', '^', ''] as const

/** MIDI note number → ABC pitch token (C = MIDI 60). */
export function midiToAbcPitch(midi: number): string {
  const n = Math.round(midi)
  const pc = ((n % 12) + 12) % 12
  const octave = Math.floor(n / 12) - 1 // MIDI 60 → octave 4
  const letter = PC_LETTER[pc]!
  const acc = PC_ACC[pc]!
  if (octave >= 5) {
    let token = `${acc}${letter.toLowerCase()}`
    for (let o = 5; o < octave; o++) token += "'"
    return token
  }
  let token = `${acc}${letter}`
  for (let o = 4; o > octave; o--) token += ','
  return token
}

function durSuffix(quarters: number): string {
  const q = Math.max(1, Math.round(quarters))
  return q === 1 ? '' : String(q)
}

function voiceLine(voice: NotationVoice, chords: readonly NotationChord[]): string {
  const parts: string[] = []
  for (const ch of chords) {
    const pitch = midiToAbcPitch(ch.midi[voice])
    const dur = durSuffix(ch.quarters)
    let token = `${pitch}${dur}`
    if (ch.highlight?.[voice] === 'bad') {
      token = `!emphasis!${token}`
    }
    parts.push(token)
  }
  return parts.join(' ')
}

/**
 * Build a multi-voice ABC tune for a pedagogical miniature (notes only).
 */
export function notationExampleToAbc(example: NotationExample): string {
  return [
    'X:1',
    'M:none',
    'L:1/4',
    'K:C',
    '%%score (T L) | (Br B)',
    'V:T clef=treble-8',
    'V:L clef=treble-8',
    'V:Br clef=bass',
    'V:B clef=bass',
    `[V:T] ${voiceLine('tenor', example.chords)} |]`,
    `[V:L] ${voiceLine('lead', example.chords)} |]`,
    `[V:Br] ${voiceLine('bari', example.chords)} |]`,
    `[V:B] ${voiceLine('bass', example.chords)} |]`,
  ].join('\n')
}
