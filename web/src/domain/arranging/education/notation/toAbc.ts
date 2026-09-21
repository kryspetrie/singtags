/**
 * Convert NotationExample → ABC notation (pure domain, no DOM / no abcjs).
 * Staffing: Tenor+Lead on treble-8 (tenor staff); Bari+Bass on bass.
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

function voiceLine(
  voice: NotationVoice,
  chords: readonly NotationChord[],
  opts: { chordSymbols?: boolean; markBad?: boolean },
): string {
  const parts: string[] = []
  for (const ch of chords) {
    const pitch = midiToAbcPitch(ch.midi[voice])
    const dur = durSuffix(ch.quarters)
    let token = `${pitch}${dur}`
    if (opts.markBad && ch.highlight?.[voice] === 'bad') {
      token = `!emphasis!${token}`
    }
    if (opts.chordSymbols && voice === 'lead') {
      const lab = ch.label.replace(/"/g, '')
      token = `"${lab}"${token}`
    }
    parts.push(token)
  }
  return parts.join(' ')
}

/**
 * Build a multi-voice ABC tune for a pedagogical miniature.
 */
export function notationExampleToAbc(example: NotationExample): string {
  const title = example.title.replace(/\n/g, ' ')
  const lines = [
    'X:1',
    `T:${title}`,
    `C:${example.conceptCite}`,
    'M:none',
    'L:1/4',
    '%%score (T L) | (Br B)',
    'V:T clef=treble-8 name=Tenor snm=T',
    'V:L clef=treble-8 name=Lead snm=L',
    'V:Br clef=bass name=Bari snm=Br',
    'V:B clef=bass name=Bass snm=B',
    `[V:T] ${voiceLine('tenor', example.chords, { markBad: true })} |]`,
    `[V:L] ${voiceLine('lead', example.chords, { chordSymbols: true, markBad: true })} |]`,
    `[V:Br] ${voiceLine('bari', example.chords, { markBad: true })} |]`,
    `[V:B] ${voiceLine('bass', example.chords, { markBad: true })} |]`,
  ]
  const ann = example.chords.map((c) => c.annotation).filter(Boolean)
  if (ann.length) {
    lines.push(`W:${ann.join(' · ')}`)
  }
  lines.push(`W:${example.caption}`)
  return lines.join('\n')
}
