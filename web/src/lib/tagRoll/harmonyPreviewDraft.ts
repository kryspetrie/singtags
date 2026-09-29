/**
 * Ephemeral harmony preview — audition before Apply (popover + Harmonize).
 * Not persisted; overlays locked sketch for transport / lane chrome only.
 */
import type { HarmonySketchQuality, HarmonySketchSpan } from './types'

export type HarmonyPreviewBaseline = {
  rootPc: number
  quality: HarmonySketchQuality
}

export type HarmonyPreviewDraft = {
  /** Span id when editing Sketch/Detected; synthetic when Harmonize. */
  id: string
  startTick: number
  endTick: number
  rootPc: number
  quality: HarmonySketchQuality
  /** Chord before the preview session (Reset target). Null = empty / new. */
  baseline: HarmonyPreviewBaseline | null
  source: 'popover' | 'harmonize' | 'coach'
}

export function previewDraftDirty(draft: HarmonyPreviewDraft): boolean {
  const b = draft.baseline
  if (!b) return true
  return b.rootPc !== draft.rootPc || b.quality !== draft.quality
}

function overlaps(
  a: { startTick: number; endTick: number },
  b: { startTick: number; endTick: number },
): boolean {
  return a.startTick < b.endTick && b.startTick < a.endTick
}

/**
 * Locked sketch for mixer/scheduler, with an active preview replacing any
 * overlapping locked span (so Play hears the candidate, not the committed chord).
 * Same-as-baseline previews on an existing lock are skipped (no audible change).
 * Hole previews (no overlapping lock) always inject so Detected/Harmonize can audition.
 */
export function sketchSpansForAudition(
  spans: readonly HarmonySketchSpan[],
  preview: HarmonyPreviewDraft | null,
): HarmonySketchSpan[] {
  const locked = spans.filter((s) => s.locked)
  if (!preview) return locked

  const overlapping = locked.filter((s) => overlaps(s, preview))
  if (overlapping.length && !previewDraftDirty(preview)) return locked

  const withoutOverlap = locked.filter((s) => !overlaps(s, preview))
  // Fingerprint id so chord changes drop the old sounding span and start a new one.
  withoutOverlap.push({
    id: `preview:${preview.startTick}:${preview.endTick}:${preview.rootPc}:${preview.quality}`,
    startTick: preview.startTick,
    endTick: preview.endTick,
    rootPc: preview.rootPc,
    quality: preview.quality,
    source: 'user',
    locked: true,
  })
  return withoutOverlap
}
