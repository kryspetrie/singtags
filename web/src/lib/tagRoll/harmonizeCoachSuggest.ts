/**
 * Coach session helpers for Harmonize → Suggest tab.
 */
import {
  mergeCoachSessionFromExisting,
  migratePillarsToSketchIfEmpty,
} from '../../application/arranging/mergeCoachSession'
import { mergeArrangementIntoTagRoll, tagStudioToArrangement } from '../../application/arranging/syncTagRoll'
import { getArrangingServices } from '../../composition/arranging'
import type { MelodyEvent } from '../../domain/arranging/types'
import type { TagRollNote } from '../../lib/tagRoll/types'
import { useArrangementStore } from '../../stores/arrangement'
import { useTagRollStore } from '../../stores/tagRoll'

export async function ensureHarmonizeCoachSession(): Promise<boolean> {
  const tagStore = useTagRollStore()
  const arrStore = useArrangementStore()
  const tag = tagStore.current
  if (!tag) return false
  const services = getArrangingServices()
  await arrStore.hydrate()
  const linkId = `arr_${tag.id}`
  const existing = arrStore.projects.find((p) => p.id === linkId)
  if (!(tag.harmonySketch ?? []).some((s) => s.locked) && existing?.pillars.length) {
    tagStore.setHarmonySketch(
      migratePillarsToSketchIfEmpty(tag.harmonySketch ?? [], existing.pillars),
    )
  }
  const live = tagStore.current!
  const fresh = tagStudioToArrangement(live, services.idGen)
  fresh.id = linkId
  if (existing) {
    mergeCoachSessionFromExisting(fresh, existing, {
      harmonySketch: live.harmonySketch ?? [],
      nextId: (prefix) => services.idGen.next(prefix),
    })
  }
  await arrStore.adoptProject(fresh)
  return true
}

export function pushCoachStacksToRoll(): void {
  const tagStore = useTagRollStore()
  const arrStore = useArrangementStore()
  const tag = tagStore.current
  const arr = arrStore.current
  if (!tag || !arr) return
  const services = getArrangingServices()
  const merged = mergeArrangementIntoTagRoll(tag, arr, services.idGen)
  tagStore.replaceNotesFromExternal(merged.notes, {
    title: merged.title,
    bpm: merged.bpm,
    tonality: merged.tonality,
    preferFlats: merged.preferFlats,
    lengthTicks: merged.lengthTicks,
  })
  if (merged.harmonySketch) tagStore.setHarmonySketch(merged.harmonySketch)
}

export function melodyEventFromTagNote(note: TagRollNote): MelodyEvent {
  return {
    id: note.id,
    midi: note.midi,
    startTick: note.startTick,
    durationTicks: note.durationTicks,
    role: note.role === 'pmn' || note.role === 'smn' ? note.role : 'unknown',
  }
}
