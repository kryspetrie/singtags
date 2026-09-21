/**
 * Embellishment / swipe seeds (Approach Two Step VII sketch).
 * Does not auto-write notes — returns optional stack suggestions for human apply.
 */
import type { ArrangementProject, ChordStack, MelodyEvent } from './types'
import { newId } from './types'

export type EmbellishmentSeed = {
  id: string
  kind: 'swipe' | 'echo' | 'tag_hint'
  noteId: string
  message: string
  /** Optional pre-built passing stack under the hold (same lead, short duration). */
  suggestedStack?: ChordStack
}

export function findEmbellishmentSeeds(project: ArrangementProject): EmbellishmentSeed[] {
  const out: EmbellishmentSeed[] = []
  const sorted = [...project.melody].sort((a, b) => a.startTick - b.startTick)
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]!
    const next = sorted[i + 1]
    const gap = next ? next.startTick - (n.startTick + n.durationTicks) : 1920
    if (n.durationTicks >= 960 && gap >= 120) {
      const base = project.stacks.find((s) => s.startTick === n.startTick)
      let suggestedStack: ChordStack | undefined
      if (base?.midi) {
        const swipeDur = Math.min(240, Math.floor(n.durationTicks / 4))
        suggestedStack = {
          ...base,
          id: newId('emb'),
          startTick: n.startTick + n.durationTicks - swipeDur,
          durationTicks: swipeDur,
          layer: 'embellishment',
          ruleTags: [...base.ruleTags],
          midi: base.midi ? { ...base.midi } : null,
        }
      }
      out.push({
        id: `swipe-seed-${n.id}`,
        kind: 'swipe',
        noteId: n.id,
        message: 'Long hold — optional swipe into the release.',
        suggestedStack,
      })
    }
    if (i === sorted.length - 1 && n.durationTicks >= 480) {
      out.push({
        id: `tag-hint-${n.id}`,
        kind: 'tag_hint',
        noteId: n.id,
        message: 'Phrase end — consider a short tag / button if the form calls for it.',
      })
    }
  }
  return out
}

export function applyEmbellishmentSeed(
  project: ArrangementProject,
  seed: EmbellishmentSeed,
): ArrangementProject {
  if (!seed.suggestedStack) return project
  const stacks = [...project.stacks, seed.suggestedStack].sort(
    (a, b) => a.startTick - b.startTick,
  )
  return { ...project, stacks }
}

export function melodyWithLyric(
  melody: readonly MelodyEvent[],
  noteId: string,
  lyric: string,
): MelodyEvent[] {
  return melody.map((n) => (n.id === noteId ? { ...n, lyric } : n))
}
