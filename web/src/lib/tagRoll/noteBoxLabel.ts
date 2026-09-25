/**
 * In-box piano-roll labels: note names spelled for the local key (e.g. D, Bb).
 */
import { midiPitchLabel } from './keySignature'
import { keyAtTick, type KeyAtTick } from './keyMap'
import type { TagRollKeyMarker } from './types'

/** Pitch-class name for a MIDI note (no octave), using key flat/sharp preference. */
export function noteBoxPitchName(midi: number, preferFlats: boolean): string {
  const full = midiPitchLabel(midi, preferFlats)
  return full.replace(/\d+$/, '')
}

/** Draw note name (and optional lyric) for a project note rect. */
export function paintNoteBoxLabel(
  ctx: CanvasRenderingContext2D,
  opts: {
    midi: number
    startTick: number
    lyric?: string | null
    x: number
    y: number
    w: number
    h: number
    fillStyle: string
    keyMarkers: readonly TagRollKeyMarker[] | undefined
    keyFallback: KeyAtTick
  },
): void {
  if (opts.w <= 18 || opts.h <= 10) return
  const key = keyAtTick(opts.startTick, opts.keyMarkers, opts.keyFallback)
  const label = noteBoxPitchName(opts.midi, key.preferFlats)
  const fontPx = Math.max(8, Math.min(opts.h - 3, 11))
  ctx.fillStyle = opts.fillStyle
  ctx.font = `${fontPx}px sans-serif`
  ctx.textBaseline = 'middle'
  const pad = 4
  const maxW = Math.max(4, opts.w - pad * 2)
  const cy = opts.y + opts.h / 2
  const lyric = opts.lyric?.trim()
  const text = lyric ? `${label} ${lyric}`.slice(0, 20) : label
  ctx.fillText(text, opts.x + pad, cy, maxW)
}
