/**
 * Vertical/horizontal guide lines for scale notes on FFT / spectrogram.
 */
import type { DigitalTunerScaleMode } from '../../lib/preferences/digitalTuner'
import { noteDisplayPartsFromMidi, preferFlatsForKeyPc } from './noteDisplayParts'

const MAJOR_DEGREES = [0, 2, 4, 5, 7, 9, 11] as const
const MINOR_DEGREES = [0, 2, 3, 5, 7, 8, 10] as const
const CHROMATIC_DEGREES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const

export type ScaleGuideLine = {
  hz: number
  midi: number
  pc: number
  /** Compact label (e.g. A4) — null when too dense to label every line. */
  label: string | null
  tonic: boolean
}

/** Pitch classes in the active scale (absolute 0…11). */
export function scalePitchClasses(
  keyPc: number,
  mode: DigitalTunerScaleMode,
): number[] {
  const tonic = ((Math.round(keyPc) % 12) + 12) % 12
  const degrees =
    mode === 'major' ? MAJOR_DEGREES : mode === 'minor' ? MINOR_DEGREES : CHROMATIC_DEGREES
  return degrees.map((d) => (tonic + d) % 12)
}

/** MIDI notes in band that fall on scale degrees. */
export function scaleGuideLinesInBand(opts: {
  fMinHz: number
  fMaxHz: number
  a4Hz: number
  keyPc: number
  scaleMode: DigitalTunerScaleMode
}): ScaleGuideLine[] {
  const a4 = opts.a4Hz > 0 ? opts.a4Hz : 440
  const fMin = Math.max(20, opts.fMinHz)
  const fMax = Math.max(fMin + 1, opts.fMaxHz)
  const pcs = new Set(scalePitchClasses(opts.keyPc, opts.scaleMode))
  const tonic = ((Math.round(opts.keyPc) % 12) + 12) % 12
  const preferFlats = preferFlatsForKeyPc(opts.keyPc)
  const midiLo = Math.max(0, Math.ceil(69 + 12 * Math.log2(fMin / a4) - 1e-9))
  const midiHi = Math.min(127, Math.floor(69 + 12 * Math.log2(fMax / a4) + 1e-9))
  const out: ScaleGuideLine[] = []
  for (let midi = midiLo; midi <= midiHi; midi++) {
    const pc = ((midi % 12) + 12) % 12
    if (!pcs.has(pc)) continue
    const hz = a4 * 2 ** ((midi - 69) / 12)
    if (hz < fMin || hz > fMax) continue
    const parts = noteDisplayPartsFromMidi(midi, preferFlats)
    const label = parts
      ? `${parts.letter}${parts.accidentalGlyph}${parts.octave}`
      : null
    out.push({
      hz,
      midi,
      pc,
      label,
      tonic: pc === tonic,
    })
  }
  return out
}

/**
 * Place text labels so neighbors don't stack.
 * Keeps higher-salience items; nudges x when needed; drops if still colliding.
 */
export function layoutNonOverlappingLabels<T extends { x: number; text: string; salience: number }>(
  items: readonly T[],
  opts: { minGapPx: number; width: number },
): Array<T & { drawX: number }> {
  const minGap = Math.max(8, opts.minGapPx)
  const width = Math.max(1, opts.width)
  // One label per identical text — strongest wins (kills hysteresis doubles).
  const byText = new Map<string, T>()
  for (const it of [...items].sort((a, b) => b.salience - a.salience)) {
    const key = it.text.trim() || `hz:${Math.round(it.x)}`
    if (!byText.has(key)) byText.set(key, it)
  }
  const sorted = [...byText.values()].sort((a, b) => a.x - b.x)
  const placed: Array<T & { drawX: number }> = []
  for (const it of sorted) {
    let drawX = Math.max(minGap / 2, Math.min(width - minGap / 2, it.x))
    const prev = placed[placed.length - 1]
    if (prev && drawX - prev.drawX < minGap) {
      drawX = prev.drawX + minGap
      if (drawX > width - minGap / 2) continue
    }
    placed.push({ ...it, drawX })
  }
  return placed
}
