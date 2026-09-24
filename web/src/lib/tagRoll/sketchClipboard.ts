/**
 * Clipboard helpers for Chords-lane harmony sketch spans (mirrors note clipboard shape).
 */
import type { HarmonySketchQuality, HarmonySketchSpan } from './types'

export type ClipboardSketchSpan = {
  /** Relative to clipboard origin (min startTick of copied set). */
  startTick: number
  durationTicks: number
  rootPc: number
  quality: HarmonySketchQuality
}

export type TagRollSketchClipboard = {
  spans: ClipboardSketchSpan[]
  spanTicks: number
}

export function spansToClipboard(
  spans: readonly HarmonySketchSpan[],
): TagRollSketchClipboard | null {
  if (!spans.length) return null
  const sorted = [...spans].sort((a, b) => a.startTick - b.startTick)
  const origin = sorted[0]!.startTick
  let end = origin
  const out: ClipboardSketchSpan[] = sorted.map((s) => {
    const durationTicks = Math.max(1, s.endTick - s.startTick)
    end = Math.max(end, s.startTick + durationTicks)
    return {
      startTick: s.startTick - origin,
      durationTicks,
      rootPc: s.rootPc,
      quality: s.quality,
    }
  })
  return { spans: out, spanTicks: Math.max(1, end - origin) }
}

export function clipboardSpansAtPlayhead(
  clip: TagRollSketchClipboard,
  playheadTick: number,
  lengthTicks: number,
): Array<{ startTick: number; endTick: number; rootPc: number; quality: HarmonySketchQuality }> {
  const origin = Math.max(0, playheadTick)
  return clip.spans
    .map((s) => {
      const startTick = origin + s.startTick
      const endTick = startTick + s.durationTicks
      if (startTick >= lengthTicks) return null
      return {
        startTick,
        endTick: Math.min(lengthTicks, endTick),
        rootPc: s.rootPc,
        quality: s.quality,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x != null && x.endTick > x.startTick)
}

export function spansIntersectingTickRange(
  spans: readonly HarmonySketchSpan[],
  a: number,
  b: number,
): HarmonySketchSpan[] {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return spans.filter((s) => s.startTick < hi && lo < s.endTick)
}
