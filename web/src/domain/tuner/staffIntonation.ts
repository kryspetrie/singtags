/**
 * Staff intonation plot — time × MIDI samples colored by zone.
 */

import { classifyInTuneZone, type InTuneZone } from './inTuneZones'

export type StaffSample = {
  tMs: number
  midi: number
  cents: number
  zone: InTuneZone
}

export type StaffClef = 'treble' | 'bass'

/** MIDI range for staff viewport (approx). */
export function staffMidiRange(clef: StaffClef): { lo: number; hi: number } {
  return clef === 'bass' ? { lo: 28, hi: 60 } : { lo: 48, hi: 84 }
}

export function pushStaffSample(
  buf: StaffSample[],
  sample: {
    tMs: number
    midi: number
    cents: number
    clarity: number
    windowCents: number
    nearMult?: number
  },
  maxLen = 240,
): StaffSample[] {
  const zone = classifyInTuneZone(sample.cents, sample.clarity, {
    windowCents: sample.windowCents,
    nearMult: sample.nearMult ?? 2,
  })
  buf.push({ tMs: sample.tMs, midi: sample.midi, cents: sample.cents, zone })
  while (buf.length > maxLen) buf.shift()
  return buf
}

/** Map MIDI to 0…1 within clef staff (0 = bottom). */
export function midiToStaffY01(midi: number, clef: StaffClef): number {
  const { lo, hi } = staffMidiRange(clef)
  if (hi <= lo) return 0.5
  return Math.min(1, Math.max(0, (midi - lo) / (hi - lo)))
}
