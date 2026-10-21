/**
 * Same-chord revoice under an ensemble VoicingProfile — moment alts + path helpers.
 */
import {
  BARBERSHOP_CHORDS,
  VOICINGS_BY_CHORD,
  placeVoicingConcert,
  ttbbPartsDistinct,
  type VoicingPitches,
} from './chords/chords'
import { ringTier } from './contestProfile'
import { voiceLeadScore } from './theoryScores'
import { partJumpCost } from './pathOptimize/partLeaps'
import type { ArrangementProject, ChordStack } from './types'
import {
  midiFitsPartBands,
  partBandFitScore,
  pitchCenterScore,
  shuffleWithSeed,
  type VoicingProfile,
} from './voicingProfile'

export type RevoiceAlternative = {
  midi: VoicingPitches
  voicing: string
  spread: boolean
  score: number
}

export { shuffleWithSeed }

function scoreAlt(
  midi: VoicingPitches,
  profile: VoicingProfile,
  natureId: string,
  prev: VoicingPitches | null,
): number {
  let s = 0
  s += partBandFitScore('bass', midi.bass, profile)
  s += partBandFitScore('bari', midi.bari, profile)
  s += partBandFitScore('tenor', midi.tenor, profile)
  s += pitchCenterScore(midi, profile)
  s += Math.max(0, 6 - ringTier(natureId)) * 1.5
  if (prev) {
    s += voiceLeadScore(prev, midi) * 0.08
    s -= partJumpCost(prev, midi) * 0.15
  }
  return s
}

/**
 * Ranked same-root/nature placements for one stack (Lead locked to melody).
 * Only returns inversions that fit part bands + max outer span.
 */
export function listRevoiceAlternatives(
  project: ArrangementProject,
  tick: number,
  profile: VoicingProfile,
  opts?: { exploreSeed?: number; limit?: number },
): RevoiceAlternative[] {
  const stack = [...project.stacks]
    .filter((s) => s.startTick <= tick && tick < s.startTick + Math.max(1, s.durationTicks))
    .sort((a, b) => b.startTick - a.startTick)[0]
  if (!stack?.midi) {
    const at = project.stacks.find((s) => s.startTick === tick)
    if (!at?.midi) return []
    return listAltsForStack(project, at, profile, opts)
  }
  return listAltsForStack(project, stack, profile, opts)
}

function listAltsForStack(
  project: ArrangementProject,
  stack: ChordStack,
  profile: VoicingProfile,
  opts?: { exploreSeed?: number; limit?: number },
): RevoiceAlternative[] {
  const midi0 = stack.midi
  if (!midi0) return []
  const leadMidi =
    project.melody.find((m) => m.startTick === stack.startTick)?.midi ?? midi0.lead
  const chord =
    BARBERSHOP_CHORDS.find((c) => c.id === stack.natureId) ??
    BARBERSHOP_CHORDS.find((c) => c.id === 'major')!
  const strings = VOICINGS_BY_CHORD[stack.natureId] ?? VOICINGS_BY_CHORD.major ?? []
  const prev =
    [...project.stacks]
      .filter((s) => s.startTick < stack.startTick && s.midi)
      .sort((a, b) => b.startTick - a.startTick)[0]?.midi ?? null

  const alts: RevoiceAlternative[] = []
  const seen = new Set<string>()
  // Always offer closed + open when they fit the visual max span / bands.
  const spreads = [false, true]
  for (const voicing of strings) {
    for (const spread of spreads) {
      const placed = placeVoicingConcert({
        chord,
        rootPc: stack.rootPc,
        leadMidi,
        voicing,
        spread,
      })
      if (!placed) continue
      const midi: VoicingPitches = { ...placed, lead: leadMidi }
      if (!ttbbPartsDistinct(midi)) continue
      if (!midiFitsPartBands(midi, profile)) continue
      const key = `${midi.bass},${midi.bari},${midi.lead},${midi.tenor}:${spread ? 1 : 0}`
      if (seen.has(key)) continue
      seen.add(key)
      alts.push({
        midi,
        voicing,
        spread,
        score: scoreAlt(midi, profile, stack.natureId, prev),
      })
    }
  }
  alts.sort((a, b) => b.score - a.score)
  const limit = opts?.limit ?? 16
  let out = alts.slice(0, Math.max(limit, 8))
  if (opts?.exploreSeed != null && opts.exploreSeed !== 0) {
    const head = out.slice(0, Math.min(3, out.length))
    const tail = shuffleWithSeed(out.slice(head.length), opts.exploreSeed)
    out = [...head, ...tail].slice(0, limit)
  }
  return out.slice(0, limit)
}

/** Apply one alternative MIDI onto a stack (same root/nature). */
export function applyRevoiceAlternative(
  project: ArrangementProject,
  stackId: string,
  alt: RevoiceAlternative,
): ArrangementProject {
  return {
    ...project,
    stacks: project.stacks.map((s) =>
      s.id === stackId
        ? {
            ...s,
            midi: alt.midi,
            voicing: alt.voicing,
            spread: alt.spread,
          }
        : s,
    ),
  }
}
