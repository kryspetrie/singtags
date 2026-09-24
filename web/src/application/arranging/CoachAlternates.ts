/**
 * Alternates / filters for Coach Choose (DTO helpers — no Vue).
 */
import { pcName } from '../../domain/arranging/chords/chords'
import type { HarmonizeCandidate } from '../../domain/arranging/harmonize'
import type { HarmonicMoment } from '../../domain/arranging/harmonicMoments'
import { momentToMelodyEvent } from '../../domain/arranging/harmonicMoments'
import type { ArrangementProject } from '../../domain/arranging/types'
import {
  listSubstitutionsForNote,
  suggestCounterpartForStack,
} from './DocumentOps'
import { listTheorySubstitutionChips } from './TheoryAssist'

export type CandFilterId = 'all' | 'pcf' | 'scf' | 'sevenths'

export type AltChipDto = {
  id: string
  label: string
  rootPc: number
  natureIds: readonly string[]
  /** Plain reason for tooltip / Guided. */
  reason: string
}

export type CounterpartDto = {
  stackId: string
  label: string
  reason: string
  toRootPc: number
  natureId: string
  voicing: string
}

const FILTER_LABELS: Record<CandFilterId, string> = {
  all: 'All',
  pcf: 'Home family',
  scf: 'Passing',
  sevenths: 'Sevenths',
}

export function candFilterLabels(): { id: CandFilterId; label: string }[] {
  return (Object.keys(FILTER_LABELS) as CandFilterId[]).map((id) => ({
    id,
    label: FILTER_LABELS[id],
  }))
}

export function filterCandidates(
  candidates: readonly HarmonizeCandidate[],
  filter: CandFilterId,
): HarmonizeCandidate[] {
  if (filter === 'all') return [...candidates]
  if (filter === 'pcf') return candidates.filter((c) => c.layer === 'primary')
  if (filter === 'scf') return candidates.filter((c) => c.layer === 'passing' || c.scfGroup != null)
  return candidates.filter((c) => c.natureId === 'seventh' || c.natureId === 'ninth')
}

export function layerHintForCandidate(c: HarmonizeCandidate): string {
  if (c.layer === 'primary') return 'home family'
  if (c.scfGroup != null) return `passing · group ${c.scfGroup} (color between homes)`
  return 'passing'
}

/** Short cadence badge when Why?/ranking surfaces classic_cadences fit. */
export function cadenceBadgeFromWhyFactors(
  factors: readonly { label: string; value: number; teachingId?: string; detail?: string }[],
): string | null {
  const hit = factors.find((f) => f.label === 'cadenceFit' && f.value > 0)
  if (!hit) return null
  // Prefer teach detail pattern name when present ("… II7→V7→I …")
  if (hit.detail) {
    const m = hit.detail.match(/\b(V7→I|II7→V7→I|I7→IV|IV→I|♭II7→I|♭VII7→I)\b/)
    if (m) return m[1]!
  }
  return 'Cadence'
}

export type ChordCandidateGroup = {
  key: string
  label: string
  best: HarmonizeCandidate
  stacks: HarmonizeCandidate[]
}

/** Group ranked stacks by root+nature so UI can show chords first, then inversions. */
export function groupCandidatesByChord(
  candidates: readonly HarmonizeCandidate[],
  preferFlats: boolean,
): ChordCandidateGroup[] {
  const order: string[] = []
  const map = new Map<string, HarmonizeCandidate[]>()
  for (const c of candidates) {
    const key = `${c.rootPc}:${c.natureId}`
    if (!map.has(key)) {
      map.set(key, [])
      order.push(key)
    }
    map.get(key)!.push(c)
  }
  return order.map((key) => {
    const stacks = map.get(key)!
    const best = stacks[0]!
    const root = pcName(best.rootPc, preferFlats)
    const nat =
      best.natureId === 'major' ? '' : best.natureId === 'seventh' ? '7' : best.natureId
    return {
      key,
      label: `${root}${nat}`,
      best,
      stacks,
    }
  })
}

/** Chips that have at least one matching ranked candidate (hide empty). */
export function altChipsForMoment(
  project: ArrangementProject,
  moment: HarmonicMoment,
  candidates: readonly HarmonizeCandidate[],
  preferFlats: boolean,
): AltChipDto[] {
  const note = momentToMelodyEvent(moment)
  const theory = listTheorySubstitutionChips(project, note)
  const branches = listSubstitutionsForNote(project, note)
  const reasonByStrategy = new Map(branches.map((b) => [b.strategy, b.reason]))

  const out: AltChipDto[] = []
  for (const chip of theory) {
    const hit = candidates.some(
      (c) => c.rootPc === chip.rootPc && chip.natureIds.includes(c.natureId),
    )
    if (!hit) continue
    const root = pcName(chip.rootPc, preferFlats)
    const nat = chip.natureIds[0] === 'seventh' ? '7' : chip.natureIds[0] ?? ''
    out.push({
      id: `${chip.id}-${chip.rootPc}`,
      label: chip.label.includes('@') ? `${root}${nat === '7' ? '7' : ''} · ${plainStrategy(chip.id)}` : `${root}${nat === '7' ? '7' : ''} · ${chip.label}`,
      rootPc: chip.rootPc,
      natureIds: chip.natureIds,
      reason: reasonByStrategy.get(chip.id as never) ?? plainStrategy(chip.id),
    })
  }
  return out.slice(0, 6)
}

function plainStrategy(id: string): string {
  switch (id) {
    case 'pillar_pcf':
      return 'home chord'
    case 'secondary_dom':
      return 'secondary dominant'
    case 'subdominant_approach':
      return 'subdominant approach'
    case 'relative_minor':
      return 'relative minor'
    case 'scf_group':
      return 'passing color'
    default:
      return id.replace(/_/g, ' ')
  }
}

export function counterpartForMoment(
  project: ArrangementProject,
  moment: HarmonicMoment,
  preferFlats: boolean,
): CounterpartDto | null {
  const stack = project.stacks.find((s) => s.startTick === moment.startTick)
  if (!stack) return null
  const sug = suggestCounterpartForStack(project, stack.id)
  if (!sug) return null
  const to = pcName(sug.toRoot, preferFlats)
  const nat = sug.natureId === 'ninth' ? '7(9)' : '7'
  return {
    stackId: stack.id,
    label: `${to}${nat} · ${sug.voicing}`,
    reason: sug.reason,
    toRootPc: sug.toRoot,
    natureId: sug.natureId,
    voicing: sug.voicing,
  }
}

export function pickCandidateForAltChip(
  candidates: readonly HarmonizeCandidate[],
  chip: AltChipDto,
): HarmonizeCandidate | null {
  return (
    candidates.find((c) => c.rootPc === chip.rootPc && chip.natureIds.includes(c.natureId)) ??
    candidates.find((c) => c.rootPc === chip.rootPc) ??
    null
  )
}
