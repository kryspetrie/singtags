/**
 * Sync helpers: Tag Studio TagRollProject ↔ ArrangementProject via tagRollBridge.
 * Schemas stay separate; TTBB notes + harmony sketch / pillars are projected.
 */
import {
  arrangementToTagRoll,
  tagRollToArrangement,
  type BridgeIdGen,
} from '../../domain/arranging/bridge/tagRollBridge'
import type { ArrangementProject } from '../../domain/arranging/types'
import {
  authoritativeSketch,
  pillarsFromHarmonySketch,
  replaceSketchFromPillars,
} from '../../lib/tagRoll/harmonySketch'
import type { TagRollNote, TagRollProject } from '../../lib/tagRoll/types'

const TTBB = new Set(['Tenor', 'Lead', 'Bari', 'Bass'])

/** Open coach: Tag Studio document → arrangement; locked sketch seeds pillars. */
export function tagStudioToArrangement(
  project: TagRollProject,
  idGen?: BridgeIdGen,
): ArrangementProject {
  // Bridge uses a portable subset; SingTags extras (swing, expressions) are ignored on import.
  const arr = tagRollToArrangement(project as never, idGen)
  const next =
    idGen?.next.bind(idGen) ??
    ((prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`)
  const fromSketch = pillarsFromHarmonySketch(project.harmonySketch ?? [], next)
  return {
    ...arr,
    pillars: fromSketch.map((p) => ({
      id: p.id,
      rootPc: p.rootPc,
      startTick: p.startTick,
      endTick: p.endTick,
      source: p.source,
      confirmed: p.confirmed,
    })),
  }
}

/**
 * Project arrangement stacks onto an existing TagRoll document.
 * Preserves Lead notes (and non-TTBB parts) from the live roll so portamento
 * overlaps stay intact; Tenor/Bari/Bass come from coach stacks.
 * Pillars fully replace authoritative sketch (qualities preserved where spans match).
 */
export function mergeArrangementIntoTagRoll(
  tag: TagRollProject,
  arrangement: ArrangementProject,
  idGen?: BridgeIdGen,
): TagRollProject {
  const projected = arrangementToTagRoll(arrangement, idGen)
  const partIdByName = new Map(tag.parts.map((p) => [p.name, p.id]))
  const projectedIdByName = new Map(projected.parts.map((p) => [p.name, p.id]))

  const leadPart =
    (tag.view.melodyPartId
      ? tag.parts.find((p) => p.id === tag.view.melodyPartId)
      : undefined) ?? tag.parts.find((p) => p.name === 'Lead')

  const kept = tag.notes.filter((n) => {
    const part = tag.parts.find((p) => p.id === n.partId)
    if (!part) return true
    if (leadPart && n.partId === leadPart.id) return true
    return !TTBB.has(part.name)
  })

  const mapped: TagRollNote[] = []
  for (const n of projected.notes) {
    const name = projected.parts.find((p) => p.id === n.partId)?.name
    // Lead stays from the live roll; only write harmony parts from stacks.
    if (!name || name === 'Lead' || !TTBB.has(name)) continue
    const partId = partIdByName.get(name) ?? projectedIdByName.get(name)
    if (!partId) continue
    mapped.push({ ...n, partId })
  }

  const harmonySketch = replaceSketchFromPillars(tag.harmonySketch ?? [], arrangement.pillars)

  return {
    ...tag,
    title: arrangement.title || tag.title,
    bpm: arrangement.bpm || tag.bpm,
    tonality: arrangement.tonality,
    tonalityMode: arrangement.tonalityMode ?? 'major',
    preferFlats: arrangement.preferFlats,
    lengthTicks: Math.max(tag.lengthTicks, projected.lengthTicks),
    notes: [...kept, ...mapped],
    harmonySketch,
    updatedAt: Date.now(),
  }
}

export { authoritativeSketch, replaceSketchFromPillars }
