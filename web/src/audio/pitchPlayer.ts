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

/** Parse writ_key / key like "Major:Ab" or "G Major" → tonic note with octave 3. */
export function keyToTonicNote(key: string | null | undefined, octave = 3): string | null {
  if (!key) return null
  const colon = key.match(/^(?:Major|Minor|major|minor):([A-Ga-g][#bB♭]?)/)
  if (colon) {
    let n = colon[1].replace('♭', 'b').replace('b', 'b')
    if (n.length === 2 && n[1] === 'b') n = n[0] + 'b'
    const sharpFlat = n.length > 1 ? n.slice(1).toUpperCase().replace('B', 'b') : ''
    const letter = n[0].toUpperCase()
    const token = sharpFlat === 'b' || sharpFlat === 'B' ? `${letter}b` : sharpFlat === '#' ? `${letter}#` : letter
    return `${token}${octave}`
  }
  const spaced = key.match(/^([A-Ga-g][#bB♭]?)\s*(Major|Minor)?/i)
  if (spaced) {
    let n = spaced[1].replace('♭', 'b')
    const letter = n[0].toUpperCase()
    const acc = n.slice(1)
    const token = acc.toLowerCase().startsWith('b') ? `${letter}b` : acc.includes('#') ? `${letter}#` : letter
    return `${token}${octave}`
  }
  return null
}

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

function formatParsed(p: ParsedKey): string {
  const root = spellPc(p.pc, p.preferFlats)
  if (p.style === 'colon' && p.quality) return `${p.quality}:${root}`
  if (p.style === 'spaced' && p.quality) return `${root} ${p.quality}`
  if (p.quality) return `${root} ${p.quality}`
  return root
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
