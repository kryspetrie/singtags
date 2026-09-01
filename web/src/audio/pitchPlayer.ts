/** Web Audio pitch pipe / pay-the-key (music-website port: 40% saw + 60% sine). */

const NOTE_OFFSETS: Record<string, number> = {
  C: 0,
  'C#': 1,
  DB: 1,
  D: 2,
  'D#': 3,
  EB: 3,
  E: 4,
  F: 5,
  'F#': 6,
  GB: 6,
  G: 7,
  'G#': 8,
  AB: 8,
  A: 9,
  'A#': 10,
  BB: 10,
  B: 11,
}

/** Convert a note name like `A4` or `Bb3` to frequency in Hz (equal temperament). */
export function noteToFrequency(note: string): number {
  const m = note.trim().toUpperCase().match(/^([A-G])([#B]?)(-?\d+)$/)
  if (!m) throw new Error(`Invalid note: ${note}`)
  const name = m[2] ? `${m[1]}${m[2]}` : m[1]
  const octave = Number(m[3])
  const offset = NOTE_OFFSETS[name]
  if (offset == null) throw new Error(`Invalid note: ${note}`)
  const midi = (octave + 1) * 12 + offset
  return 440 * 2 ** ((midi - 69) / 12)
}

/** Cents offset so concert A matches `hz` instead of A440 (rounded to nearest cent). */
export function aHzToCents(hz: number, referenceHz = 440): number {
  if (!(hz > 0) || !(referenceHz > 0)) return 0
  return Math.round(1200 * Math.log2(hz / referenceHz))
}

/** Common concert-pitch presets for the pitch pipe. */
export const PITCH_PIPE_A_TUNINGS = [
  { hz: 440, label: 'A = 440 Hz' },
  { hz: 432, label: 'A = 432 Hz' },
  { hz: 444, label: 'A = 444 Hz' },
] as const

export type PitchPipeAHz = (typeof PITCH_PIPE_A_TUNINGS)[number]['hz']

/** Parse writ_key / key like "Major:Ab" or "G Major" → pitch-class token (no octave). */
function keyToTonicToken(key: string | null | undefined): string | null {
  if (!key) return null
  const colon = key.match(/^(?:Major|Minor|major|minor):([A-Ga-g][#bB♭]?)/)
  if (colon) {
    let n = colon[1].replace('♭', 'b').replace('b', 'b')
    if (n.length === 2 && n[1] === 'b') n = n[0] + 'b'
    const sharpFlat = n.length > 1 ? n.slice(1).toUpperCase().replace('B', 'b') : ''
    const letter = n[0].toUpperCase()
    return sharpFlat === 'b' || sharpFlat === 'B' ? `${letter}b` : sharpFlat === '#' ? `${letter}#` : letter
  }
  const spaced = key.match(/^([A-Ga-g][#bB♭]?)\s*(Major|Minor)?/i)
  if (spaced) {
    let n = spaced[1].replace('♭', 'b')
    const letter = n[0].toUpperCase()
    const acc = n.slice(1)
    return acc.toLowerCase().startsWith('b') ? `${letter}b` : acc.includes('#') ? `${letter}#` : letter
  }
  return null
}

function noteNameToMidi(note: string): number {
  const m = note.trim().toUpperCase().match(/^([A-G])([#B]?)(-?\d+)$/)
  if (!m) throw new Error(`Invalid note: ${note}`)
  const name = m[2] ? `${m[1]}${m[2]}` : m[1]!
  const octave = Number(m[3])
  const offset = NOTE_OFFSETS[name]
  if (offset == null) throw new Error(`Invalid note: ${note}`)
  return (octave + 1) * 12 + offset
}

/** Pay-the-key tonic must fall in this inclusive range (barbershop pitch pipe). */
export const PAY_KEY_MIN_NOTE = 'E3'
export const PAY_KEY_MAX_NOTE = 'E4'

const PAY_KEY_MIN_MIDI = noteNameToMidi(PAY_KEY_MIN_NOTE)
const PAY_KEY_MAX_MIDI = noteNameToMidi(PAY_KEY_MAX_NOTE)

const SHARP_PC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const FLAT_PC = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const

function rootToPc(root: string): number | null {
  const n = root.replace('♭', 'b').trim()
  const letter = n[0]?.toUpperCase()
  if (!letter || letter < 'A' || letter > 'G') return null
  const acc = n.slice(1).toLowerCase()
  const lookup =
    acc.startsWith('b') || acc.startsWith('♭')
      ? `${letter}B`
      : acc.includes('#')
        ? `${letter}#`
        : letter
  return NOTE_OFFSETS[lookup] ?? null
}

export interface ParsedKey {
  /** Pitch-class 0–11 */
  pc: number
  /** "Major" | "Minor" | null when bare root */
  quality: 'Major' | 'Minor' | null
  /** Prefer flat spellings when transposing */
  preferFlats: boolean
  /** Original style: colon ("Major:Ab") vs spaced ("Ab Major") vs bare ("Ab") */
  style: 'colon' | 'spaced' | 'bare'
}

/** Best-effort parse of barbershop key labels. */
export function parseKey(key: string | null | undefined): ParsedKey | null {
  if (!key?.trim()) return null
  const raw = key.trim()
  const colon = raw.match(/^(Major|Minor)\s*:\s*([A-Ga-g][#bB♭]?)$/i)
  if (colon) {
    const root = colon[2].replace('♭', 'b')
    const pc = rootToPc(root)
    if (pc == null) return null
    const q = colon[1].toLowerCase().startsWith('min') ? 'Minor' : 'Major'
    const preferFlats = /b|♭/i.test(root) || !root.includes('#')
    return { pc, quality: q, preferFlats, style: 'colon' }
  }
  const spaced = raw.match(/^([A-Ga-g][#bB♭]?)\s*(Major|Minor)$/i)
  if (spaced) {
    const root = spaced[1].replace('♭', 'b')
    const pc = rootToPc(root)
    if (pc == null) return null
    const q = spaced[2].toLowerCase().startsWith('min') ? 'Minor' : 'Major'
    const preferFlats = /b|♭/i.test(root) || !/[A-G]#/i.test(root)
    return { pc, quality: q, preferFlats, style: 'spaced' }
  }
  const bare = raw.match(/^([A-Ga-g][#bB♭]?)$/)
  if (bare) {
    const root = bare[1].replace('♭', 'b')
    const pc = rootToPc(root)
    if (pc == null) return null
    const preferFlats = /b|♭/i.test(root) || !root.includes('#')
    return { pc, quality: null, preferFlats, style: 'bare' }
  }
  return null
}

function spellPc(pc: number, preferFlats: boolean): string {
  const i = ((pc % 12) + 12) % 12
  return preferFlats ? FLAT_PC[i]! : SHARP_PC[i]!
}

/**
 * Parse writ_key / key → tonic note in E3–E4 (inclusive) for pay-the-key / pitch hold.
 */
export function keyToTonicNote(key: string | null | undefined): string | null {
  const parsed = parseKey(key)
  if (parsed) {
    const root = spellPc(parsed.pc, parsed.preferFlats)
    for (const oct of [3, 4]) {
      const candidate = `${root}${oct}`
      try {
        const midi = noteNameToMidi(candidate)
        if (midi >= PAY_KEY_MIN_MIDI && midi <= PAY_KEY_MAX_MIDI) return candidate
      } catch {
        /* try next octave */
      }
    }
    return null
  }
  const token = keyToTonicToken(key)
  if (!token) return null
  for (const oct of [3, 4]) {
    const candidate = `${token}${oct}`
    try {
      const midi = noteNameToMidi(candidate)
      if (midi >= PAY_KEY_MIN_MIDI && midi <= PAY_KEY_MAX_MIDI) return candidate
    } catch {
      /* try next octave */
    }
  }
  return null
}

function formatParsed(p: ParsedKey): string {
  const root = spellPc(p.pc, p.preferFlats)
  if (p.style === 'colon' && p.quality) return `${p.quality}:${root}`
  if (p.style === 'spaced' && p.quality) return `${root} ${p.quality}`
  if (p.quality) return `${root} ${p.quality}`
  return root
}

export const MIN_PITCH_SEMITONES = -12
export const MAX_PITCH_SEMITONES = 12

/** Clamp UI pitch shift to ± one octave. */
export function clampPitchSemitones(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(MIN_PITCH_SEMITONES, Math.min(MAX_PITCH_SEMITONES, Math.round(n)))
}

/** Transpose a key label by whole semitones; preserves Major/Minor wording style. */
export function transposeKeyLabel(key: string | null | undefined, semitones: number): string | null {
  const parsed = parseKey(key)
  if (!parsed) return null
  const next: ParsedKey = {
    ...parsed,
    pc: (parsed.pc + Math.round(semitones) + 1200) % 12,
  }
  return formatParsed(next)
}

/**
 * Display for pitch shift UI: `Ab Major +2 (Bb Major)`.
 * With no catalog key: prompt to choose, then show the selected key (from C).
 */
export function formatKeyShiftLabel(key: string | null | undefined, shift: number): string {
  const base = key?.trim() || ''
  const n = Math.round(shift)
  if (!base) {
    if (!n) return '(Use +/- to choose key)'
    return transposeKeyLabel('C Major', n) ?? (n > 0 ? `+${n}` : String(n))
  }
  if (!n) return base
  const adj = n > 0 ? `+${n}` : String(n)
  const neu = transposeKeyLabel(base, n)
  return neu ? `${base} ${adj} (${neu})` : `${base} ${adj}`
}

/**
 * Widest label {@link formatKeyShiftLabel} produces for normal catalog keys (± one octave).
 * Used to size pitch controls so the chip doesn’t resize or ellipsize as the shift changes.
 */
export const KEY_SHIFT_LABEL_SIZE_SAMPLE: string = (() => {
  let best = formatKeyShiftLabel(null, 0)
  const roots = [...new Set([...SHARP_PC, ...FLAT_PC])]
  for (const root of roots) {
    for (const quality of ['Major', 'Minor'] as const) {
      for (const key of [`${root} ${quality}`, `${quality}:${root}`, root]) {
        for (const shift of [
          MIN_PITCH_SEMITONES,
          MAX_PITCH_SEMITONES,
          0,
          1,
          -1,
          10,
          -10,
        ]) {
          const label = formatKeyShiftLabel(key, shift)
          if (label.length > best.length) best = label
        }
      }
    }
  }
  return best
})()

/**
 * Web Audio pitch pipe: blended saw + sine oscillators with fade in/out.
 * Used by the pitch-pipe page and tag-page pay-the-key control.
 */
export class PitchPlayer {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private oscillators: OscillatorNode[] = []
  private gains: GainNode[] = []
  private playing = false

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.3
      this.master.connect(this.ctx.destination)
    }
    return this.ctx
  }

  async start(note: string, detuneCents = 0): Promise<void> {
    const ctx = this.ensure()
    if (ctx.state === 'suspended') await ctx.resume()
    this.stop(false)
    const base = noteToFrequency(note)
    const freq = base * 2 ** (detuneCents / 1200)
    const now = ctx.currentTime
    const saw = ctx.createOscillator()
    const sine = ctx.createOscillator()
    saw.type = 'sawtooth'
    sine.type = 'sine'
    saw.frequency.value = freq
    sine.frequency.value = freq
    const sawGain = ctx.createGain()
    const sineGain = ctx.createGain()
    sawGain.gain.value = 0
    sineGain.gain.value = 0
    saw.connect(sawGain)
    sine.connect(sineGain)
    sawGain.connect(this.master!)
    sineGain.connect(this.master!)
    sawGain.gain.linearRampToValueAtTime(0.4, now + 0.05)
    sineGain.gain.linearRampToValueAtTime(0.6, now + 0.05)
    saw.start()
    sine.start()
    this.oscillators = [saw, sine]
    this.gains = [sawGain, sineGain]
    this.playing = true
  }

  stop(fade = true): void {
    if (!this.ctx || !this.playing) {
      this.cleanupOsc()
      return
    }
    const ctx = this.ctx
    const now = ctx.currentTime
    const osc = [...this.oscillators]
    const gains = [...this.gains]
    this.oscillators = []
    this.gains = []
    this.playing = false
    if (!fade) {
      for (const o of osc) {
        try {
          o.stop()
          o.disconnect()
        } catch {
          /* ignore */
        }
      }
      return
    }
    for (const g of gains) {
      g.gain.cancelScheduledValues(now)
      g.gain.setValueAtTime(g.gain.value, now)
      g.gain.linearRampToValueAtTime(0, now + 1)
    }
    window.setTimeout(() => {
      for (const o of osc) {
        try {
          o.stop()
          o.disconnect()
        } catch {
          /* ignore */
        }
      }
    }, 1100)
  }

  private cleanupOsc(): void {
    for (const o of this.oscillators) {
      try {
        o.stop()
        o.disconnect()
      } catch {
        /* ignore */
      }
    }
    this.oscillators = []
    this.gains = []
    this.playing = false
  }

  dispose(): void {
    this.stop(false)
    void this.ctx?.close()
    this.ctx = null
    this.master = null
  }
}

export const CHROMATIC_NOTES: string[] = (() => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const out: string[] = []
  for (let oct = 2; oct <= 4; oct++) {
    for (const n of names) out.push(`${n}${oct}`)
  }
  return out
})()

function chromaticNotesBetween(from: string, to: string): string[] {
  const start = noteNameToMidi(from)
  const end = noteNameToMidi(to)
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
  const out: string[] = []
  for (let midi = start; midi <= end; midi++) {
    const oct = Math.floor(midi / 12) - 1
    out.push(`${names[midi % 12]!}${oct}`)
  }
  return out
}

/** Pitch-pipe page note sets (chromatic, inclusive). */
export type PitchPipeRange = 'e3-e4' | 'f3-f4' | 'c3-c4' | 'c4-c5'

export const PITCH_PIPE_RANGE_OPTIONS: Array<{ value: PitchPipeRange; label: string }> = [
  { value: 'e3-e4', label: 'E3 – E4' },
  { value: 'f3-f4', label: 'F3 – F4' },
  { value: 'c3-c4', label: 'C3 – C4' },
  { value: 'c4-c5', label: 'C4 – C5' },
]

/** Chromatic notes for the pitch-pipe grid, low → high. */
export const PITCH_PIPE_NOTES: Record<PitchPipeRange, readonly string[]> = {
  'e3-e4': chromaticNotesBetween('E3', 'E4'),
  'f3-f4': chromaticNotesBetween('F3', 'F4'),
  'c3-c4': chromaticNotesBetween('C3', 'C4'),
  'c4-c5': chromaticNotesBetween('C4', 'C5'),
}

export function isPitchPipeRange(v: unknown): v is PitchPipeRange {
  return v === 'e3-e4' || v === 'f3-f4' || v === 'c3-c4' || v === 'c4-c5'
}

/** Map retired range ids (and current ones) to a valid PitchPipeRange. */
export function normalizePitchPipeRange(v: unknown): PitchPipeRange | null {
  if (isPitchPipeRange(v)) return v
  if (v === 'c2-c4') return 'c3-c4'
  if (v === 'c4-c6') return 'c4-c5'
  return null
}

export function pitchPipeNotes(range: PitchPipeRange): string[] {
  return [...PITCH_PIPE_NOTES[range]]
}

export const PITCH_PIPE_GRID_COLS = 4

const SHARP_TO_FLAT: Record<string, string> = {
  'C#': 'Db',
  'D#': 'Eb',
  'F#': 'Gb',
  'G#': 'Ab',
  'A#': 'Bb',
}

const FLAT_TO_SHARP: Record<string, string> = {
  Db: 'C#',
  Eb: 'D#',
  Gb: 'F#',
  Ab: 'G#',
  Bb: 'A#',
}

/** Pitch-pipe button arrangements. */
export type PitchPipeLayout = 'grid' | 'list' | 'piano'

export const PITCH_PIPE_LAYOUT_OPTIONS: Array<{ value: PitchPipeLayout; label: string }> = [
  { value: 'grid', label: 'Grid' },
  { value: 'list', label: 'Wide list' },
  { value: 'piano', label: 'Vertical piano' },
]

/** Display pitch token with ♯ / ♭ (e.g. C# → C♯, Db → D♭). */
export function toPitchGlyph(token: string): string {
  if (token.endsWith('#')) return `${token.slice(0, -1)}♯`
  if (token.length === 2 && token[1]?.toLowerCase() === 'b') return `${token[0]!.toUpperCase()}♭`
  return token
}

export type PitchPipeDisplay = {
  note: string
  sharp: string | null
  flat: string | null
  octave: string
  /** Black-key / enharmonic pair (shows both spellings). */
  isBlack: boolean
  /** Letter name for natural keys (C…B). */
  pitchClass: string
}

function pitchClassToken(pitch: string): string {
  const m = pitch.match(/^([A-G])/)
  return m?.[1]?.toUpperCase() ?? pitch[0]?.toUpperCase() ?? 'C'
}

/** Pitch-pipe label — enharmonics show sharp and flat spellings with ♯/♭. */
export function pitchPipeDisplay(note: string): PitchPipeDisplay {
  const m = note.match(/^([A-G](?:#|b)?)(\d+)$/i)
  if (!m) {
    return { note, sharp: null, flat: null, octave: '', isBlack: false, pitchClass: 'C' }
  }
  const pitch = m[1]!
  const octave = m[2]!
  const pitchClass = pitchClassToken(pitch)
  if (pitch.includes('#')) {
    const sharpAscii = pitch[0]!.toUpperCase() + '#'
    const flatAscii = SHARP_TO_FLAT[sharpAscii] ?? null
    return {
      note,
      sharp: toPitchGlyph(sharpAscii),
      flat: flatAscii ? toPitchGlyph(flatAscii) : null,
      octave,
      isBlack: true,
      pitchClass,
    }
  }
  if (/b/i.test(pitch.slice(1))) {
    const flatAscii = pitch[0]!.toUpperCase() + 'b'
    const sharpAscii = FLAT_TO_SHARP[flatAscii] ?? null
    return {
      note,
      sharp: sharpAscii ? toPitchGlyph(sharpAscii) : null,
      flat: toPitchGlyph(flatAscii),
      octave,
      isBlack: true,
      pitchClass,
    }
  }
  return { note, sharp: toPitchGlyph(pitch), flat: null, octave, isBlack: false, pitchClass }
}

export function pitchPipeAriaLabel(note: string): string {
  const d = pitchPipeDisplay(note)
  if (d.isBlack && d.sharp && d.flat) return `Play ${d.sharp}${d.octave} (${d.flat}${d.octave})`
  return `Play ${d.sharp ?? note}${d.octave}`
}

/** White / black key slots for a vertical piano strip (low → high in data order).
 * Views that show high pitches at the top should reverse `whites` for display and
 * place each black key on the boundary above its `after` (lower) white key.
 */
export function pitchPipePianoSlots(notes: string[]): {
  whites: string[]
  /** Black key and the white-key note immediately below it in pitch (lower neighbor). */
  blacks: Array<{ note: string; after: string }>
} {
  const whites: string[] = []
  const blacks: Array<{ note: string; after: string }> = []
  let lastWhite: string | null = null
  for (const note of notes) {
    const d = pitchPipeDisplay(note)
    if (d.isBlack) {
      if (lastWhite) blacks.push({ note, after: lastWhite })
    } else {
      whites.push(note)
      lastWhite = note
    }
  }
  return { whites, blacks }
}
