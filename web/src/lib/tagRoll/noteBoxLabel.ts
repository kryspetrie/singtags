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
    /** Inset from left/right (e.g. clear of resize handles). */
    padX?: number
    /** Show pitch name (default true). */
    showNoteName?: boolean
    /** Show lyric after the pitch name (default true). */
    showNoteLyric?: boolean
  },
): void {
  if (opts.w <= 18 || opts.h <= 10) return
  const showName = opts.showNoteName !== false
  const showLyric = opts.showNoteLyric !== false
  if (!showName && !showLyric) return

  const key = keyAtTick(opts.startTick, opts.keyMarkers, opts.keyFallback)
  const label = showName ? noteBoxPitchName(opts.midi, key.preferFlats) : ''
  const lyric = showLyric ? opts.lyric?.trim() || '' : ''
  if (!label && !lyric) return

  const fontPx = Math.max(8, Math.min(opts.h - 3, 11))
  const fontStack = 'system-ui, sans-serif'
  ctx.fillStyle = opts.fillStyle
  ctx.textBaseline = 'middle'
  const pad = Math.max(2, opts.padX ?? 4)
  const maxW = Math.max(4, opts.w - pad * 2)
  const cy = opts.y + opts.h / 2
  let x = opts.x + pad
  let remaining = maxW

  if (label) {
    // Bold pitch name by default.
    ctx.font = `700 ${fontPx}px ${fontStack}`
    const nameW = Math.min(remaining, ctx.measureText(label).width)
    ctx.fillText(label, x, cy, remaining)
    x += nameW
    remaining = Math.max(0, remaining - nameW)
  }

  if (lyric && remaining > 4) {
    // Non-bold italic lyric, spaced after the pitch name when both show.
    ctx.font = `italic 400 ${fontPx}px ${fontStack}`
    const text = label ? ` ${lyric}` : lyric
    ctx.fillText(text.slice(0, 20), x, cy, remaining)
  }
}

/** Darken a #rgb / #rrggbb color toward black (factor 0–1, lower = darker). */
export function darkenCssColor(color: string, factor = 0.55): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return color
  let hex = m[1]!
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const n = parseInt(hex, 16)
  const r = Math.round(((n >> 16) & 255) * factor)
  const g = Math.round(((n >> 8) & 255) * factor)
  const b = Math.round((n & 255) * factor)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}
