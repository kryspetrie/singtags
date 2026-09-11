/**
 * Acoustic piano sample map + lazy per-octave Opus loader.
 *
 * Samples live at `/instruments/piano/m{midi}.opus` (app static / backend).
 * Source: Leethring piano-sound-samples (MIT) — see public/instruments/piano/NOTICE.
 */
import { decodeAudioDataExclusive } from './decodeLock'

/** MIDI range we ship for the pitch-pipe / sheet piano (C2–F7). */
export const PIANO_SAMPLE_MIDI_MIN = 36 // C2
export const PIANO_SAMPLE_MIDI_MAX = 101 // F7

export const PIANO_SAMPLE_ENGINE_OPTIONS = [
  { value: 'synth' as const, label: 'Pitch pipe (synth)' },
  { value: 'samples' as const, label: 'Acoustic piano (samples)' },
]

export type PianoSoundEngineId = (typeof PIANO_SAMPLE_ENGINE_OPTIONS)[number]['value']

export function isPianoSoundEngineId(v: unknown): v is PianoSoundEngineId {
  return v === 'synth' || v === 'samples'
}

/** Scientific note → MIDI (C4 = 60). Accepts # / b accidentals. */
export function noteToMidi(note: string): number {
  const m = note.trim().toUpperCase().match(/^([A-G])([#B]?)(-?\d+)$/)
  if (!m) throw new Error(`Invalid note: ${note}`)
  const letter = m[1]!
  const acc = m[2] === 'B' ? 'b' : m[2] === '#' ? '#' : ''
  const octave = Number(m[3])
  const pcTable: Record<string, number> = {
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
  const key = acc ? `${letter}${acc === 'b' ? 'B' : '#'}` : letter
  const pc = pcTable[key]
  if (pc == null) throw new Error(`Invalid note: ${note}`)
  return (octave + 1) * 12 + pc
}

/** MIDI → sharp-spelled scientific note (C4 = 60). */
export function midiToNote(midi: number): string {
  const n = Math.round(midi)
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
  const oct = Math.floor(n / 12) - 1
  return `${names[((n % 12) + 12) % 12]!}${oct}`
}

/**
 * Leethring natural/sharp filename stem for a MIDI note (no extension).
 * Covers A0–C8; returns null outside that set.
 */
export function leethringStemForMidi(midi: number): string | null {
  if (midi < 21 || midi > 108) return null
  const pc = ((midi % 12) + 12) % 12
  const sharp = pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10
  if (pc === 4 || pc === 11) {
    /* E / B — no sharp file */
  }
  const naturalLetter = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'][pc]!
  const naturalMidi = midi - (sharp ? 1 : 0)
  const natOct = Math.floor(naturalMidi / 12) - 1

  let base: string
  if (naturalMidi <= 23) {
    base = `${naturalLetter}_2`
  } else if (natOct === 1) {
    base = `${naturalLetter}_1`
  } else if (natOct === 2) {
    base = naturalLetter
  } else if (natOct === 3) {
    const L = naturalLetter.toLowerCase()
    base = `${L}${L}`
  } else if (natOct >= 4 && natOct <= 7) {
    base = `${naturalLetter.toLowerCase()}${natOct - 3}`
  } else if (naturalMidi === 108) {
    base = 'c5'
  } else {
    return null
  }
  return sharp ? `${base}s` : base
}

/** App-static URL for one piano sample. */
export function pianoSampleUrl(midi: number): string {
  const base = import.meta.env.BASE_URL || '/'
  const root = base.endsWith('/') ? base : `${base}/`
  return `${root}instruments/piano/m${midi}.opus`
}

const bufferCache = new Map<number, AudioBuffer>()
const octaveLoads = new Map<number, Promise<void>>()
let lastError: string | null = null

export function getPianoSampleLoadError(): string | null {
  return lastError
}

export function clearPianoSampleCache(): void {
  bufferCache.clear()
  octaveLoads.clear()
  lastError = null
}

export function getCachedPianoSample(midi: number): AudioBuffer | null {
  return bufferCache.get(midi) ?? null
}

/** Scientific octave for a MIDI note (C4 → 4). */
export function midiOctave(midi: number): number {
  return Math.floor(midi / 12) - 1
}

async function fetchAndDecode(midi: number): Promise<AudioBuffer> {
  const hit = bufferCache.get(midi)
  if (hit) return hit
  const url = pianoSampleUrl(midi)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Piano sample missing (${midi}): ${res.status}`)
  }
  const data = await res.arrayBuffer()
  const buf = await decodeAudioDataExclusive(data)
  bufferCache.set(midi, buf)
  return buf
}

/**
 * Ensure all samples for scientific octave `oct` (C–B) are decoded.
 * Also accepts notes outside C–B that fall in our ship range when oct is inferred.
 */
export async function ensurePianoOctave(oct: number): Promise<void> {
  const o = Math.trunc(oct)
  const existing = octaveLoads.get(o)
  if (existing) return existing

  const load = (async () => {
    const midis: number[] = []
    for (let pc = 0; pc < 12; pc++) {
      const midi = (o + 1) * 12 + pc
      if (midi < PIANO_SAMPLE_MIDI_MIN || midi > PIANO_SAMPLE_MIDI_MAX) continue
      midis.push(midi)
    }
    // C of next octave sits on the boundary (useful for C–C windows)
    const topC = (o + 1 + 1) * 12
    if (topC >= PIANO_SAMPLE_MIDI_MIN && topC <= PIANO_SAMPLE_MIDI_MAX) {
      midis.push(topC)
    }
    const results = await Promise.allSettled(midis.map((m) => fetchAndDecode(m)))
    const failed = results.filter((r) => r.status === 'rejected')
    if (failed.length === midis.length && midis.length > 0) {
      const reason = failed[0]!.status === 'rejected' ? failed[0].reason : null
      lastError =
        reason instanceof Error
          ? reason.message
          : 'Couldn’t load piano samples. Encode them into /instruments/piano/ (see NOTICE).'
      throw new Error(lastError)
    }
    if (failed.length) {
      lastError = `Loaded ${midis.length - failed.length}/${midis.length} samples for octave ${o}`
    } else {
      lastError = null
    }
  })()

  octaveLoads.set(o, load)
  try {
    await load
  } catch (err) {
    octaveLoads.delete(o)
    throw err
  }
}

/** Prefetch the octave of `note` and its neighbors (±1). */
export async function ensurePianoOctavesAroundNote(note: string): Promise<void> {
  const midi = noteToMidi(note)
  const oct = midiOctave(midi)
  await ensurePianoOctave(oct)
  void ensurePianoOctave(oct - 1).catch(() => undefined)
  void ensurePianoOctave(oct + 1).catch(() => undefined)
}
