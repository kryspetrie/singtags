/**
 * Compose vs repair entry detection for Coach routing.
 */
import type { ArrangementProject, ChordStack } from './types'

export type CoachEntryMode = 'compose' | 'repair'

export function isKnownStack(s: ChordStack): boolean {
  return !!(s.midi && s.natureId && s.natureId !== 'unknown')
}

export function knownStackCount(project: ArrangementProject): number {
  return project.stacks.filter(isKnownStack).length
}

/** Coverage of known (identified) stacks vs moment/melody count. */
export function knownStackCoverage(
  project: ArrangementProject,
  momentsLen?: number,
): number {
  const denom = Math.max(1, momentsLen ?? project.melody.length)
  return knownStackCount(project) / denom
}

/**
 * Compose: build from lead. Repair: chart already has substantial harmony.
 */
export function detectCoachEntryMode(
  project: ArrangementProject | null,
  momentsLen?: number,
): CoachEntryMode {
  if (!project?.melody.length) return 'compose'
  const withMidi = project.stacks.filter((s) => s.midi)
  if (!withMidi.length) return 'compose'

  const known = knownStackCount(project)
  const unknown = withMidi.filter((s) => !s.natureId || s.natureId === 'unknown').length
  const denom = Math.max(1, momentsLen ?? project.melody.length)
  const knownCov = known / denom
  const anyCov = withMidi.length / denom

  // Substantial identified harmony, or half-filled with unknowns (imported TTBB).
  if (knownCov >= 0.35) return 'repair'
  if (anyCov >= 0.5 && unknown > 0) return 'repair'
  if (withMidi.length >= Math.max(2, Math.ceil(project.melody.length * 0.35))) return 'repair'
  return 'compose'
}
