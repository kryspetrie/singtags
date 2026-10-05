/**
 * Embellishment / swipe seeds (Approach Two Step VII sketch).
 * Does not auto-write notes — returns optional stack suggestions for human apply.
 */
import {
  BARBERSHOP_CHORDS,
  leadRoleInChord,
  placeVoicing,
  voicingFitsLead,
  VOICINGS_BY_CHORD,
  type VoicingPitches,
} from './chords/chords'
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

function midiEqual(a: VoicingPitches, b: VoicingPitches): boolean {
  return a.bass === b.bass && a.bari === b.bari && a.lead === b.lead && a.tenor === b.tenor
}

/** Prefer a legal alternate placement so the swipe is audible (not a duplicate hold). */
function swipeMidiForBase(base: ChordStack, leadMidi: number): {
  midi: VoicingPitches
  voicing: string
} | null {
  if (!base.midi) return null
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === base.natureId)
  if (!chord) return null
  const leadRole = leadRoleInChord(chord, base.rootPc, leadMidi)
  if (leadRole == null) return null
  const catalog = VOICINGS_BY_CHORD[base.natureId] ?? []
  const ordered = [
    ...catalog.filter((v) => v !== base.voicing),
    ...(base.voicing ? [base.voicing] : []),
  ]
  for (const voicing of ordered) {
    if (!voicingFitsLead(voicing, leadRole)) continue
    const placed = placeVoicing({
      chord,
      rootPc: base.rootPc,
      leadMidi,
      voicing,
      spread: base.spread,
    })
    if (!placed) continue
    if (midiEqual(placed, base.midi) && voicing === base.voicing) continue
    return { midi: placed, voicing }
  }
  return null
}

export function findEmbellishmentSeeds(project: ArrangementProject): EmbellishmentSeed[] {
  const out: EmbellishmentSeed[] = []
  const sorted = [...project.melody].sort((a, b) => a.startTick - b.startTick)
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]!
    const next = sorted[i + 1]
    const gap = next ? next.startTick - (n.startTick + n.durationTicks) : 1920
    if (n.durationTicks >= 960 && gap >= 120) {
      const base = project.stacks.find(
        (s) =>
          s.layer !== 'embellishment' &&
          s.startTick === n.startTick &&
          !!s.midi,
      )
      let suggestedStack: ChordStack | undefined
      if (base?.midi) {
        const swipeDur = Math.min(240, Math.floor(n.durationTicks / 4))
        const alt = swipeMidiForBase(base, n.midi)
        if (alt) {
          suggestedStack = {
            ...base,
            id: newId('emb'),
            startTick: n.startTick + n.durationTicks - swipeDur,
            durationTicks: swipeDur,
            layer: 'embellishment',
            voicing: alt.voicing,
            ruleTags: [...base.ruleTags],
            midi: alt.midi,
          }
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

/**
 * Insert the swipe stack and shorten any host stack that overlaps it so TBB
 * notes actually change on the roll (no silent duplicate segment).
 */
export function applyEmbellishmentSeed(
  project: ArrangementProject,
  seed: EmbellishmentSeed,
): ArrangementProject {
  if (!seed.suggestedStack) return project
  const swipe = seed.suggestedStack
  const swipeEnd = swipe.startTick + swipe.durationTicks
  const stacks = project.stacks
    .map((s) => {
      if (s.layer === 'embellishment') return s
      const end = s.startTick + s.durationTicks
      // Host that covers the swipe onset: trim so it ends at the swipe.
      if (s.startTick < swipe.startTick && end > swipe.startTick) {
        return {
          ...s,
          durationTicks: Math.max(1, swipe.startTick - s.startTick),
        }
      }
      // Exact-onset duplicate of the hold: also trim if it spans the swipe.
      if (s.startTick === swipe.startTick && end > swipeEnd) {
        return null
      }
      return s
    })
    .filter((s): s is ChordStack => s != null)

  stacks.push(swipe)
  stacks.sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id))
  return { ...project, stacks }
}

export function melodyWithLyric(
  melody: readonly MelodyEvent[],
  noteId: string,
  lyric: string,
): MelodyEvent[] {
  return melody.map((n) => (n.id === noteId ? { ...n, lyric } : n))
}
