/**
 * Coach selection preview — sketch draft + TTBB ghosts without L/R inspect bounds.
 */
import type { HarmonizeCandidate } from '../../domain/arranging/harmonize'
import type { HarmonyPreviewDraft } from '../tagRoll/harmonyPreviewDraft'
import { natureToSketchQuality } from '../tagRoll/harmonySketch'

export type CoachPreviewGhost = {
  role: string
  midi: number
  startTick: number
  durationTicks: number
  color: string
}

export type CoachPreviewVoicing = {
  rootPc: number
  natureId: string
  midi: { tenor: number; bari: number; bass: number; lead?: number }
}

/** Sketch-lane / transport audition draft for a Coach-selected chord. */
export function coachSketchPreviewDraft(
  startTick: number,
  durationTicks: number,
  rootPc: number,
  natureId: string,
): HarmonyPreviewDraft {
  const start = Math.max(0, Math.round(startTick))
  const end = Math.max(start + 1, start + Math.max(1, Math.round(durationTicks)))
  return {
    id: `coach-preview:${start}:${end}`,
    startTick: start,
    endTick: end,
    rootPc,
    quality: natureToSketchQuality(natureId),
    baseline: null,
    source: 'coach',
  }
}

export function coachGhostsForVoicing(
  v: CoachPreviewVoicing,
  startTick: number,
  durationTicks: number,
  colorFor: (partName: string, fallback: string) => string,
): CoachPreviewGhost[] {
  const dur = Math.max(1, durationTicks)
  return [
    {
      role: 'tenor',
      midi: v.midi.tenor,
      startTick,
      durationTicks: dur,
      color: colorFor('Tenor', '#c45c26'),
    },
    {
      role: 'bari',
      midi: v.midi.bari,
      startTick,
      durationTicks: dur,
      color: colorFor('Bari', '#2f7d4a'),
    },
    {
      role: 'bass',
      midi: v.midi.bass,
      startTick,
      durationTicks: dur,
      color: colorFor('Bass', '#5b3d8f'),
    },
  ]
}

export function coachPreviewFromCandidate(
  c: HarmonizeCandidate,
  startTick: number,
  durationTicks: number,
  colorFor: (partName: string, fallback: string) => string,
): { draft: HarmonyPreviewDraft; ghosts: CoachPreviewGhost[] } {
  return {
    draft: coachSketchPreviewDraft(startTick, durationTicks, c.rootPc, c.natureId),
    ghosts: coachGhostsForVoicing(c, startTick, durationTicks, colorFor),
  }
}
