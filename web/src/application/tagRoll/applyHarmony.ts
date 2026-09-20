import type { IdGenerator } from '../../ports/IdGenerator'
import {
  applyHarmonyToNotes,
  type HarmonyPitches,
} from '../../lib/tagRoll/harmonizer/applyHarmony'
import type { TagRollNote, TagRollPart, TagRollProject } from '../../lib/tagRoll/types'

export type ApplyHarmonyInput = {
  project: TagRollProject
  melodyNoteId: string
  pitches: HarmonyPitches
  idGen: IdGenerator
  cursorTick?: number
}

export type ApplyHarmonyResult =
  | { ok: true; notes: TagRollNote[] }
  | { ok: false; reason: 'missing-project' | 'missing-melody' }

/** Use-case: upsert harmony notes via pure applyHarmony + injected IdGenerator. */
export function applyHarmony(input: ApplyHarmonyInput): ApplyHarmonyResult {
  const melody = input.project.notes.find((n) => n.id === input.melodyNoteId)
  if (!melody) return { ok: false, reason: 'missing-melody' }
  const notes = applyHarmonyToNotes({
    notes: input.project.notes,
    parts: input.project.parts as TagRollPart[],
    melody,
    pitches: input.pitches,
    cursorTick: input.cursorTick,
    idGen: input.idGen,
  })
  return { ok: true, notes }
}
