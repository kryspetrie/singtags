/**
 * Sync helpers: Tag Studio TagRollProject ↔ ArrangementProject via tagRollBridge.
 * Schemas stay separate; only TTBB notes are projected back into the roll.
 */
import {
  arrangementToTagRoll,
  tagRollToArrangement,
  type BridgeIdGen,
} from '../../domain/arranging/bridge/tagRollBridge'
import type { ArrangementProject } from '../../domain/arranging/types'
import type { TagRollNote, TagRollProject } from '../../lib/tagRoll/types'

const TTBB = new Set(['Tenor', 'Lead', 'Bari', 'Bass'])

/** Open coach: Tag Studio document → arrangement (pillars empty until Infer). */
export function tagStudioToArrangement(
  project: TagRollProject,
  idGen?: BridgeIdGen,
): ArrangementProject {
  // Bridge uses a portable subset; SingTags extras (swing, expressions) are ignored on import.
  return tagRollToArrangement(project as never, idGen)
}

/**
 * Project arrangement stacks onto an existing TagRoll document.
 * Preserves Lead notes (and non-TTBB parts) from the live roll so portamento
 * overlaps stay intact; Tenor/Bari/Bass come from coach stacks.
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

  return {
    ...tag,
    title: arrangement.title || tag.title,
    bpm: arrangement.bpm || tag.bpm,
    tonality: arrangement.tonality,
    tonalityMode: arrangement.tonalityMode ?? 'major',
    preferFlats: arrangement.preferFlats,
    lengthTicks: Math.max(tag.lengthTicks, projected.lengthTicks),
    notes: [...kept, ...mapped],
    updatedAt: Date.now(),
  }
}
