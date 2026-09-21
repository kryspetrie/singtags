/**
 * Keep harmony stacks aligned when melody notes move / change pitch.
 */
import type { ArrangementProject, ChordStack, MelodyEvent } from './types'
import { candidatesForMelodyNote, candidateToStack } from './harmonize'
import type { RankerDeps } from './harmonize'
import type { IdGenerator } from '../../ports/IdGenerator'

export function stackForMelodyOnset(
  stacks: readonly ChordStack[],
  note: MelodyEvent,
  prevStartTick?: number,
): ChordStack | undefined {
  const tick = prevStartTick ?? note.startTick
  return (
    stacks.find((s) => s.startTick === tick && s.midi?.lead === note.midi) ??
    stacks.find((s) => s.startTick === tick)
  )
}

/**
 * After a melody note patch, retarget the stack that lived on `prev`.
 * Re-voices when MIDI changes so lead stays correct.
 */
export function syncStackAfterMelodyEdit(
  project: ArrangementProject,
  prev: MelodyEvent,
  next: MelodyEvent,
  deps: { idGen?: IdGenerator; rankerDeps?: RankerDeps; revoice?: boolean } = {},
): ChordStack[] {
  const stack = stackForMelodyOnset(project.stacks, prev, prev.startTick)
  if (!stack) return project.stacks

  const pitchChanged = prev.midi !== next.midi
  const timingChanged =
    prev.startTick !== next.startTick || prev.durationTicks !== next.durationTicks

  if (!pitchChanged && !timingChanged) return project.stacks

  if (pitchChanged && deps.revoice !== false) {
    const pillar = project.pillars.find(
      (p) => p.startTick <= next.startTick && next.startTick < p.endTick,
    )
    if (pillar) {
      const prevStack = [...project.stacks]
        .filter((s) => s.startTick < next.startTick && s.id !== stack.id)
        .sort((a, b) => b.startTick - a.startTick)[0]
      const nextPillar = project.pillars.find((x) => x.startTick >= pillar.endTick)
      const cands = candidatesForMelodyNote({
        note: next,
        pillar,
        tonality: project.tonality,
        prevRootPc: prevStack?.rootPc ?? null,
        prevNatureId: prevStack?.natureId ?? null,
        preferScf: next.role === 'smn',
        limit: 8,
        profile: project.contestProfile,
        nextPillarRoot: nextPillar?.rootPc ?? null,
        prevMidi: prevStack?.midi ?? null,
        rankerDeps: deps.rankerDeps,
      })
      const preferSame = cands.find((c) => c.natureId === stack.natureId) ?? cands[0]
      if (preferSame) {
        const replacement = candidateToStack(next, preferSame, pillar.id, deps.idGen)
        replacement.id = stack.id
        return project.stacks.map((s) => (s.id === stack.id ? replacement : s))
      }
    }
  }

  // Timing-only (or revoice failed): shift stack envelope and nudge lead MIDI
  return project.stacks.map((s) => {
    if (s.id !== stack.id) return s
    return {
      ...s,
      startTick: next.startTick,
      durationTicks: next.durationTicks,
      midi: s.midi
        ? {
            ...s.midi,
            lead: next.midi,
            // Keep relative intervals if only octave/pitch shift of lead
            tenor: s.midi.tenor + (next.midi - prev.midi),
            bari: s.midi.bari,
            bass: s.midi.bass,
          }
        : null,
    }
  })
}
