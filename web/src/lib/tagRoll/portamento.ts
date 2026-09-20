/**
 * Monophonic portamento helpers: ease-in-out pitch curves + overlap detection.
 */
import type { TagRollNote } from './types'

/** Cosine ease-in-out on [0,1] — slow at start and end. */
export function easeInOutCosine(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return 0.5 - 0.5 * Math.cos(Math.PI * x)
}

/** Log-frequency curve from → to Hz (musical glide). */
export function frequencyEaseInOutCurve(
  fromHz: number,
  toHz: number,
  sampleCount = 64,
): Float32Array {
  const n = Math.max(2, Math.round(sampleCount))
  const out = new Float32Array(n)
  const a = Math.log(Math.max(1e-6, fromHz))
  const b = Math.log(Math.max(1e-6, toHz))
  for (let i = 0; i < n; i++) {
    const e = easeInOutCosine(i / (n - 1))
    out[i] = Math.exp(a + (b - a) * e)
  }
  return out
}

/** Playback-rate curve when the buffer is tuned to `baseHz`. */
export function playbackRateEaseInOutCurve(
  baseHz: number,
  fromHz: number,
  toHz: number,
  sampleCount = 64,
): Float32Array {
  const freqs = frequencyEaseInOutCurve(fromHz, toHz, sampleCount)
  const base = Math.max(1e-6, baseHz)
  const out = new Float32Array(freqs.length)
  for (let i = 0; i < freqs.length; i++) out[i] = freqs[i]! / base
  return out
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/**
 * Among notes that are already sounding when `incoming` starts on the same part,
 * pick the one whose body still covers `incoming.startTick` (latest start wins).
 */
export function findOverlappingPredecessor(
  notes: readonly TagRollNote[],
  incoming: TagRollNote,
): TagRollNote | null {
  let best: TagRollNote | null = null
  for (const n of notes) {
    if (n.id === incoming.id || n.partId !== incoming.partId) continue
    const end = n.startTick + n.durationTicks
    if (n.startTick < incoming.startTick && end > incoming.startTick) {
      if (!best || n.startTick > best.startTick) best = n
    }
  }
  return best
}

/** Inclusive overlap window [start, end) in ticks; null if no overlap. */
export function overlapWindow(
  a: Pick<TagRollNote, 'startTick' | 'durationTicks'>,
  b: Pick<TagRollNote, 'startTick' | 'durationTicks'>,
): { startTick: number; endTick: number } | null {
  const a0 = a.startTick
  const a1 = a.startTick + a.durationTicks
  const b0 = b.startTick
  const b1 = b.startTick + b.durationTicks
  const start = Math.max(a0, b0)
  const end = Math.min(a1, b1)
  if (end <= start) return null
  return { startTick: start, endTick: end }
}

/**
 * True when another same-part note starts at or before this note’s end
 * (overlap or abutting — no silence between them).
 */
export function hasImmediateFollower(
  notes: readonly TagRollNote[],
  note: TagRollNote,
): boolean {
  const end = note.startTick + note.durationTicks
  for (const n of notes) {
    if (n.id === note.id || n.partId !== note.partId) continue
    if (n.startTick >= note.startTick && n.startTick <= end) return true
  }
  return false
}

/** Apply project decay only when the note ends into silence (no immediate follower). */
export function shouldDecayOnNoteEnd(
  notes: readonly TagRollNote[],
  note: TagRollNote,
): boolean {
  return !hasImmediateFollower(notes, note)
}

/** Stable voice key — one sounding voice per part (strictly monophonic). */
export function partVoiceKey(partId: string): string {
  return `part:${partId}`
}

export type PortamentoLink = {
  from: TagRollNote
  to: TagRollNote
  startTick: number
  endTick: number
}

/** All same-part overlaps that trigger portamento (sorted by start). */
export function listPortamentoLinks(notes: readonly TagRollNote[]): PortamentoLink[] {
  const out: PortamentoLink[] = []
  for (const n of notes) {
    const pred = findOverlappingPredecessor(notes, n)
    if (!pred) continue
    const win = overlapWindow(pred, n)
    if (!win) continue
    out.push({ from: pred, to: n, startTick: win.startTick, endTick: win.endTick })
  }
  out.sort((a, b) => a.startTick - b.startTick || a.to.id.localeCompare(b.to.id))
  return out
}
