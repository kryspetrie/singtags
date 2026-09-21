/**
 * Collect TTBB note spans from a Tag Studio project for harmonic-moment splits.
 */
import type { PartOnset } from '../../domain/arranging/harmonicMoments'
import type { TagRollProject } from '../tagRoll/types'

const TTBB = new Set(['Tenor', 'Lead', 'Bari', 'Bass'])

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
      isLead: !!leadPart && n.partId === leadPart.id,
    })
  }
  return out
}
