/**
 * Harmonize Suggest target = sounding lead at the selected timeline column
 * (playhead / measure), not the Lead note onset or an earlier moment start.
 */
import {
  buildHarmonicMoments,
  type HarmonicMoment,
} from '../../domain/arranging/harmonicMoments'
import type { MelodyEvent } from '../../domain/arranging/types'
import { measureStartTick } from '../tagRoll/measureBeat'
import { TAG_ROLL_PPQ, type TagRollTimeSignature } from '../tagRoll/types'
import { partOnsetsFromTagRoll } from './partOnsetsFromTagRoll'
import type { TagRollProject } from '../tagRoll/types'

export function momentCoveringTick(
  moments: readonly HarmonicMoment[],
  tick: number,
): HarmonicMoment | null {
  return (
    moments.find(
      (m) =>
        m.startTick === tick ||
        (tick >= m.startTick && tick < m.startTick + m.durationTicks),
    ) ?? null
  )
}

/**
 * Timeline anchor for Suggest: inspect/chord-cursor start if set, else the
 * measure containing the playhead — never the melody note onset.
 */
export function harmonizeSuggestAnchorTick(opts: {
  playheadTick: number
  timeSignature: TagRollTimeSignature
  ppq?: number
  inspectRange?: { startTick: number; endTick: number } | null
}): number {
  const inspect = opts.inspectRange
  if (inspect && inspect.endTick > inspect.startTick) {
    return Math.max(0, Math.round(inspect.startTick))
  }
  return measureStartTick(
    opts.playheadTick,
    opts.timeSignature,
    opts.ppq ?? TAG_ROLL_PPQ,
  )
}

/**
 * Candidate / apply event at the selected timeline tick.
 * Keeps sounding lead pitch from the covering moment; startTick is the anchor.
 */
export function suggestTargetFromMoment(
  moment: HarmonicMoment,
  anchorTick: number,
): MelodyEvent {
  const window = suggestApplyWindow(moment, anchorTick)
  return {
    id: moment.leadNoteId ?? moment.id,
    midi: moment.leadMidi,
    startTick: window.startTick,
    durationTicks: window.durationTicks,
    role: moment.role,
  }
}

/** Apply / preview window: anchor start through the covering moment’s end. */
export function suggestApplyWindow(
  moment: HarmonicMoment,
  anchorTick: number,
): { startTick: number; durationTicks: number } {
  const startTick = Math.max(0, Math.round(anchorTick))
  const momentEnd = moment.startTick + Math.max(1, moment.durationTicks)
  return {
    startTick,
    durationTicks: Math.max(1, momentEnd - startTick),
  }
}

export function resolveHarmonizeSuggestMoment(opts: {
  tag: TagRollProject
  /** Arrangement / Tag-derived lead melody events. */
  melody: readonly MelodyEvent[]
  tick: number
}): HarmonicMoment | null {
  if (!opts.melody.length) return null
  const moments = buildHarmonicMoments(opts.melody, partOnsetsFromTagRoll(opts.tag))
  return momentCoveringTick(moments, opts.tick)
}

export function resolveHarmonizeSuggestTarget(opts: {
  tag: TagRollProject
  melody: readonly MelodyEvent[]
  tick: number
}): MelodyEvent | null {
  const moment = resolveHarmonizeSuggestMoment(opts)
  return moment ? suggestTargetFromMoment(moment, opts.tick) : null
}

/** All moments for Suggest stepping (Coach boundaries). */
export function listHarmonizeSuggestMoments(opts: {
  tag: TagRollProject
  melody: readonly MelodyEvent[]
}): HarmonicMoment[] {
  if (!opts.melody.length) return []
  return buildHarmonicMoments(opts.melody, partOnsetsFromTagRoll(opts.tag))
}

/** Next/prev moment relative to `tick` (wraps). */
export function stepHarmonizeSuggestMoment(
  moments: readonly HarmonicMoment[],
  tick: number,
  dir: -1 | 1,
): HarmonicMoment | null {
  if (!moments.length) return null
  const cur = momentCoveringTick(moments, tick)
  const idx = cur ? moments.findIndex((m) => m.id === cur.id) : -1
  if (idx < 0) {
    return dir > 0
      ? (moments.find((m) => m.startTick >= tick) ?? moments[0]!)
      : ([...moments].reverse().find((m) => m.startTick <= tick) ?? moments[moments.length - 1]!)
  }
  const next = (idx + dir + moments.length) % moments.length
  return moments[next]!
}
