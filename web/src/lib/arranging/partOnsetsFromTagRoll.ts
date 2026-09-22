/**
 * Collect TTBB note spans from a Tag Studio project for harmonic-moment splits.
 * Same-part portamento overlaps are deferred to the source release so coach
 * chords / playhead land where the bend completes (destination defines the chord).
 */
import type { PartOnset } from '../../domain/arranging/harmonicMoments'
import { deferOverlappingOnsets } from '../tagRoll/portamento'
import type { TagRollProject } from '../tagRoll/types'

const TTBB = new Set(['Tenor', 'Lead', 'Bari', 'Bass'])

function collapseOnsetsByPart(onsets: readonly PartOnset[]): PartOnset[] {
  const byPart = new Map<string, PartOnset[]>()
  for (const o of onsets) {
    const key = o.partId ?? (o.isLead ? '__lead__' : `__anon_${o.startTick}_${o.midi}`)
    const list = byPart.get(key) ?? []
    list.push(o)
    byPart.set(key, list)
  }
  const out: PartOnset[] = []
  for (const list of byPart.values()) {
    out.push(
      ...deferOverlappingOnsets(list, (a, b) => a.midi - b.midi),
    )
  }
  return out.sort((a, b) => a.startTick - b.startTick || a.midi - b.midi)
}

export function partOnsetsFromTagRoll(tag: TagRollProject): PartOnset[] {
  const leadPart =
    (tag.view.melodyPartId
      ? tag.parts.find((x) => x.id === tag.view.melodyPartId)
      : undefined) ?? tag.parts.find((x) => x.name === 'Lead')

  const out: PartOnset[] = []
  for (const n of tag.notes) {
    const part = tag.parts.find((p) => p.id === n.partId)
    if (!part || !TTBB.has(part.name)) continue
    out.push({
      startTick: n.startTick,
      durationTicks: n.durationTicks,
      midi: n.midi,
      partId: part.id,
      isLead: !!leadPart && n.partId === leadPart.id,
    })
  }
  return collapseOnsetsByPart(out)
}
