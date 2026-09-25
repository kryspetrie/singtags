/**
 * Shared Hear façade for Harmony sketch (lanes + Harmonize panel).
 * Resolves TTBB midis; callers own noteOn / noteOff / timers.
 */
import {
  optimizeSketchHearPath,
  sketchHearMidis,
  sketchHearVoicing,
} from './sketchHearVoicing'
import { natureToSketchQuality } from './harmonySketch'
import type { HarmonySketchQuality } from './types'

export type HearSketchChord = {
  startTick: number
  rootPc: number
  quality: string
  leadMidi: number | null
}

export type ResolveSketchHearMidisOpts = {
  startTick: number
  rootPc: number
  quality: HarmonySketchQuality | string
  leadMidi: number | null
  /**
   * `oneshot` — full path optimize when sequence provided (lane Hear / panel stab).
   * `hold` — neighbor VL only (popover draft) so the held chord can differ from stored.
   */
  mode: 'oneshot' | 'hold'
  /** Declared + Detected sequence (sorted). Omit for isolated local hear. */
  sequence?: readonly HearSketchChord[]
  tonality?: number
}

function asQuality(q: string): HarmonySketchQuality {
  return natureToSketchQuality(q)
}

/**
 * Resolve concert midis [bass, bari, lead, tenor] for a sketch Hear.
 */
export function resolveSketchHearMidis(opts: ResolveSketchHearMidisOpts): number[] {
  const quality = asQuality(opts.quality)
  const seq = opts.sequence
  const tonality = opts.tonality ?? 0

  if (seq?.length && opts.mode === 'oneshot') {
    const forPath = seq.map((s) =>
      s.startTick === opts.startTick
        ? {
            rootPc: opts.rootPc,
            quality: asQuality(opts.quality),
            leadMidi: opts.leadMidi,
          }
        : {
            rootPc: s.rootPc,
            quality: asQuality(s.quality),
            leadMidi: s.leadMidi,
          },
    )
    const idx = seq.findIndex((s) => s.startTick === opts.startTick)
    if (idx >= 0) {
      const path = optimizeSketchHearPath(forPath, { tonality })
      const hit = path[idx]
      if (hit) return [hit.bass, hit.bari, hit.lead, hit.tenor]
    }
  }

  let seqIdx = -1
  if (seq?.length) {
    seqIdx = seq.findIndex((s) => s.startTick === opts.startTick)
  }
  const prevSeg = seqIdx > 0 ? seq![seqIdx - 1] : undefined
  const nextSeg = seqIdx >= 0 && seq ? seq[seqIdx + 1] : undefined
  const prevVoicing =
    prevSeg != null
      ? sketchHearVoicing({
          rootPc: prevSeg.rootPc,
          quality: asQuality(prevSeg.quality),
          leadMidi: prevSeg.leadMidi,
        })
      : null

  return sketchHearMidis({
    rootPc: opts.rootPc,
    quality,
    leadMidi: opts.leadMidi,
    prev: prevVoicing,
    next:
      nextSeg != null
        ? {
            rootPc: nextSeg.rootPc,
            quality: asQuality(nextSeg.quality),
            leadMidi: nextSeg.leadMidi,
          }
        : null,
  })
}
