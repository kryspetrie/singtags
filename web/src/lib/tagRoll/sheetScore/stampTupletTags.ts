/**
 * Ensure notes inherit tuplet membership from project containers.
 * Explicit `note.tuplet` wins when groupId matches a container; otherwise
 * notes whose onset falls inside a same-part container are stamped.
 */
import type { TagRollNote, TagRollTuplet } from '../types'
import { tupletEndTick } from '../tupletContainers'

export function stampNotesFromTupletContainers(
  notes: readonly TagRollNote[],
  tuplets: readonly TagRollTuplet[],
): TagRollNote[] {
  if (!tuplets.length) return notes as TagRollNote[]
  const byPart = new Map<string, TagRollTuplet[]>()
  for (const t of tuplets) {
    const list = byPart.get(t.partId) ?? []
    list.push(t)
    byPart.set(t.partId, list)
  }
  return notes.map((n) => {
    const containers = byPart.get(n.partId)
    if (!containers?.length) return n
    // Prefer matching groupId when already tagged.
    if (n.tuplet) {
      const hit = containers.find((t) => t.id === n.tuplet!.groupId)
      if (hit) {
        if (
          hit.actualNotes === n.tuplet.actualNotes &&
          hit.normalNotes === n.tuplet.normalNotes
        ) {
          return n
        }
        return {
          ...n,
          tuplet: {
            groupId: hit.id,
            actualNotes: hit.actualNotes,
            normalNotes: hit.normalNotes,
          },
        }
      }
    }
    const cover = containers.find(
      (t) => n.startTick >= t.startTick && n.startTick < tupletEndTick(t),
    )
    if (!cover) return n
    if (
      n.tuplet?.groupId === cover.id &&
      n.tuplet.actualNotes === cover.actualNotes &&
      n.tuplet.normalNotes === cover.normalNotes
    ) {
      return n
    }
    return {
      ...n,
      tuplet: {
        groupId: cover.id,
        actualNotes: cover.actualNotes,
        normalNotes: cover.normalNotes,
      },
    }
  })
}
