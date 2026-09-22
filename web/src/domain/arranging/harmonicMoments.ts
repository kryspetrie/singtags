/**
 * Harmonic moments: chord-change boundaries from any TTBB note start/end,
 * with sounding lead MIDI (supports held “posts”).
 */
import type { MelodyEvent, MelodyRole } from './types'
import { deferOverlappingOnsets } from '../../lib/tagRoll/portamento'

export type PartOnset = {
  startTick: number
  durationTicks: number
  midi: number
  /** When true, this onset is the Lead/melody part. */
  isLead?: boolean
  /** Same-part key for portamento collapse (part id). */
  partId?: string
}

export type HarmonicMoment = {
  id: string
  startTick: number
  durationTicks: number
  leadMidi: number
  /** Id of the sustaining lead melody event, when known. */
  leadNoteId?: string
  /** True when lead onset is earlier than this moment (held post). */
  heldLead: boolean
  role: MelodyRole
}

/**
 * Defer lead portamento overlaps for coach / moment timing (destination onset
 * at source release). Keeps original melody ids for selection.
 */
export function melodyWithDeferredPortamento(
  melody: readonly MelodyEvent[],
): MelodyEvent[] {
  return deferOverlappingOnsets([...melody], (a, b) => a.midi - b.midi || a.id.localeCompare(b.id))
}

function coveringLead(
  leads: readonly MelodyEvent[],
  tick: number,
): MelodyEvent | null {
  return (
    leads.find((m) => m.startTick <= tick && tick < m.startTick + m.durationTicks) ?? null
  )
}

/**
 * Collect unique split ticks: every note start and end that falls under a sounding lead
 * (or is a lead start/end). A held lead with moving TBB yields one moment per split.
 */
export function collectMomentBoundaries(
  leadMelody: readonly MelodyEvent[],
  partOnsets: readonly PartOnset[],
): number[] {
  const leads = [...leadMelody].sort((a, b) => a.startTick - b.startTick)
  const boundarySet = new Set<number>()

  for (const m of leads) {
    boundarySet.add(m.startTick)
    boundarySet.add(m.startTick + m.durationTicks)
  }
  for (const p of partOnsets) {
    const start = p.startTick
    const end = p.startTick + p.durationTicks
    if (coveringLead(leads, start)) boundarySet.add(start)
    // End split: lead still sounding just before the end (part releases / re-attacks).
    if (end > start && coveringLead(leads, end - 1)) boundarySet.add(end)
  }

  return [...boundarySet].sort((a, b) => a - b)
}

/**
 * Build walk/analysis steps from lead melody + all part note spans.
 * Boundaries = unique start/end ticks of any part under a sounding lead.
 * Same-part portamento overlaps are deferred so the destination onset is the
 * source release (bend completes → chord defined by the note bent to).
 */
export function buildHarmonicMoments(
  leadMelody: readonly MelodyEvent[],
  partOnsets: readonly PartOnset[],
  opts?: { idPrefix?: string },
): HarmonicMoment[] {
  const prefix = opts?.idPrefix ?? 'hm'
  const leads = melodyWithDeferredPortamento(leadMelody)
  if (!leads.length) return []

  const onsets = collapsePartOnsets(partOnsets)
  const chartEnd = Math.max(
    ...leads.map((m) => m.startTick + m.durationTicks),
    ...onsets.map((p) => p.startTick + p.durationTicks),
    0,
  )

  const boundaries = collectMomentBoundaries(leads, onsets)
  const out: HarmonicMoment[] = []
  for (let i = 0; i < boundaries.length; i++) {
    const startTick = boundaries[i]!
    const lead = coveringLead(leads, startTick)
    if (!lead) continue
    const next = boundaries[i + 1]
    const endCap =
      next != null ? next : Math.min(chartEnd, lead.startTick + lead.durationTicks)
    const durationTicks = Math.max(1, endCap - startTick)
    // Skip zero-width duplicates (e.g. adjacent end+start at same tick already unique).
    if (next != null && next <= startTick) continue
    out.push({
      id: `${prefix}_${startTick}`,
      startTick,
      durationTicks,
      leadMidi: lead.midi,
      leadNoteId: lead.id,
      heldLead: lead.startTick < startTick,
      role: lead.role,
    })
  }
  return out
}

function collapsePartOnsets(onsets: readonly PartOnset[]): PartOnset[] {
  const byPart = new Map<string, PartOnset[]>()
  for (const o of onsets) {
    const key =
      o.partId ??
      (o.isLead ? '__lead__' : `__anon_${o.startTick}_${o.midi}_${o.durationTicks}`)
    const list = byPart.get(key) ?? []
    list.push(o)
    byPart.set(key, list)
  }
  const out: PartOnset[] = []
  for (const list of byPart.values()) {
    out.push(...deferOverlappingOnsets(list, (a, b) => a.midi - b.midi))
  }
  return out
}

/** Convenience: moments from lead melody only (no extra part onsets). */
export function momentsFromMelodyAlone(leadMelody: readonly MelodyEvent[]): HarmonicMoment[] {
  return buildHarmonicMoments(
    leadMelody,
    leadMelody.map((m) => ({
      startTick: m.startTick,
      durationTicks: m.durationTicks,
      midi: m.midi,
      isLead: true,
    })),
  )
}

/** Adapt a moment to a MelodyEvent for candidate / apply APIs. */
export function momentToMelodyEvent(m: HarmonicMoment): MelodyEvent {
  return {
    id: m.leadNoteId ?? m.id,
    midi: m.leadMidi,
    startTick: m.startTick,
    durationTicks: m.durationTicks,
    role: m.role,
  }
}
