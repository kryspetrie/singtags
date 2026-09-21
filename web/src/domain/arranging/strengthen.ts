/**
 * Step VI — strengthen: replace low-scoring stacks with better ranked alternatives.
 */
import type { ArrangementProject, ChordStack } from './types'
import type { IdGenerator } from '../../ports/IdGenerator'
import type { RankerDeps } from './harmonize'
import { candidatesForMelodyNote, candidateToStack } from './harmonize'

export function strengthenStacks(
  project: ArrangementProject,
  deps: { idGen?: IdGenerator; rankerDeps?: RankerDeps; minScoreGain?: number } = {},
): ChordStack[] {
  const minGain = deps.minScoreGain ?? 1.5
  const sortedMel = [...project.melody].sort((a, b) => a.startTick - b.startTick)
  const out: ChordStack[] = []
  let prevRoot: number | null = null
  let prevNature: string | null = null

  for (const note of sortedMel) {
    const existing = project.stacks.find((s) => s.startTick === note.startTick)
    const pillar = project.pillars.find(
      (p) => p.startTick <= note.startTick && note.startTick < p.endTick,
    )
    if (!pillar) {
      if (existing) out.push(existing)
      continue
    }
    const nextNote = sortedMel.find((n) => n.startTick > note.startTick)
    const nextPillar = nextNote
      ? project.pillars.find((p) => p.startTick <= nextNote.startTick && nextNote.startTick < p.endTick)
      : null
    const cands = candidatesForMelodyNote({
      note,
      pillar,
      tonality: project.tonality,
      prevRootPc: prevRoot,
      prevNatureId: prevNature,
      preferScf: note.role === 'smn',
      limit: 8,
      profile: project.contestProfile,
      nextPillarRoot: nextPillar?.rootPc ?? null,
      rankerDeps: deps.rankerDeps,
    })
    const best = cands[0]
    if (!best) {
      if (existing) {
        out.push(existing)
        prevRoot = existing.rootPc
        prevNature = existing.natureId
      }
      continue
    }
    if (!existing) {
      const stack = candidateToStack(note, best, pillar.id, deps.idGen)
      out.push(stack)
      prevRoot = best.rootPc
      prevNature = best.natureId
      continue
    }
    // Approximate existing score via re-rank match
    const match = cands.find(
      (c) =>
        c.natureId === existing.natureId &&
        c.voicing === existing.voicing &&
        c.rootPc === existing.rootPc,
    )
    const existingScore = match?.score ?? best.score - minGain - 1
    if (best.score >= existingScore + minGain) {
      const stack = candidateToStack(note, best, pillar.id, deps.idGen)
      stack.id = existing.id
      out.push(stack)
      prevRoot = best.rootPc
      prevNature = best.natureId
    } else {
      out.push(existing)
      prevRoot = existing.rootPc
      prevNature = existing.natureId
    }
  }

  // Keep embellishment stacks not tied to melody onsets
  for (const s of project.stacks) {
    if (s.layer === 'embellishment' && !out.some((x) => x.id === s.id)) out.push(s)
  }
  return out.sort((a, b) => a.startTick - b.startTick)
}
