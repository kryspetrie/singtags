/**
 * DTO for the Coach selected-moment context card (no theory in Vue).
 */
import { pcName } from '../../domain/arranging/chords/chords'
import type { HarmonicMoment } from '../../domain/arranging/harmonicMoments'
import type { HarmonizeCandidate } from '../../domain/arranging/harmonize'
import { functionTagForStack, type FunctionTag } from '../../domain/arranging/tensionRelease'
import type { ArrangementProject } from '../../domain/arranging/types'
import { pillarAtTick } from '../../domain/arranging/pillars'
import { romanLabelForStack } from './DocumentOps'
import { teachStackAnalysis } from './TheoryAssist'

function midiPitchLabel(midi: number, preferFlats: boolean): string {
  return `${pcName(((midi % 12) + 12) % 12, preferFlats)}${Math.floor(midi / 12) - 1}`
}

export type MomentContextDto = {
  kind: 'gap' | 'stack'
  /** Chord identity, e.g. "G7 · 1513" or lead pitch when empty. */
  title: string
  roman: string | null
  voicing: string | null
  voicingLegend: 'bass→tenor'
  layerLabel: string | null
  scfLabel: string | null
  functionTag: FunctionTag | null
  functionLabel: string | null
  heldLead: boolean
  leadPitch: string
  pillarLabel: string | null
  narrative: string | null
  /** Plain-language best-alternate hint when candidates exist. */
  bestAltHint: string | null
  /** Melody role at this moment (PMN/SMN). */
  roleLabel: string | null
  stackId: string | null
}

function natureSuffix(natureId: string): string {
  if (natureId === 'major') return ''
  if (natureId === 'seventh') return '7'
  return natureId
}

function chordTitle(
  rootPc: number,
  natureId: string,
  voicing: string | null | undefined,
  preferFlats: boolean,
): string {
  const base = `${pcName(rootPc, preferFlats)}${natureSuffix(natureId)}`
  const v = voicing?.trim()
  return v ? `${base} · ${v}` : base
}

function functionLabel(tag: FunctionTag): string {
  switch (tag) {
    case 'tension':
      return 'Tension'
    case 'release':
      return 'Release'
    case 'passing':
      return 'Passing'
    case 'color':
      return 'Color'
  }
}

function altDiffersHint(
  current: { rootPc: number; natureId: string; voicing?: string | null },
  alt: HarmonizeCandidate,
  preferFlats: boolean,
): string | null {
  if (
    current.rootPc === alt.rootPc &&
    current.natureId === alt.natureId &&
    (current.voicing ?? '') === (alt.voicing ?? '')
  ) {
    return null
  }
  const altTitle = chordTitle(alt.rootPc, alt.natureId, alt.voicing, preferFlats)
  const bits: string[] = []
  if (current.rootPc !== alt.rootPc) bits.push('root')
  if (current.natureId !== alt.natureId) bits.push('chord quality')
  if ((current.voicing ?? '') !== (alt.voicing ?? '')) bits.push('voicing shape')
  const by = bits.length ? bits.join(' / ') : 'ranking'
  return `Best alternate: ${altTitle} (differs by ${by})`
}

/**
 * Build presentational context for the selected harmonic moment.
 */
export function contextForSelectedMoment(
  project: ArrangementProject,
  moment: HarmonicMoment,
  candidates: readonly HarmonizeCandidate[] = [],
): MomentContextDto {
  const preferFlats = !!project.preferFlats
  const leadPitch = midiPitchLabel(moment.leadMidi, preferFlats)
  const pillar = pillarAtTick(project.pillars, moment.startTick)
  const pillarLabel = pillar
    ? `${pcName(pillar.rootPc, preferFlats)}${pillar.confirmed ? '' : ' (draft)'}`
    : null

  const stack = project.stacks.find((s) => s.startTick === moment.startTick) ?? null
  const roleLabel =
    moment.role === 'pmn' ? 'PMN' : moment.role === 'smn' ? 'SMN' : null

  if (!stack) {
    return {
      kind: 'gap',
      title: leadPitch,
      roman: null,
      voicing: null,
      voicingLegend: 'bass→tenor',
      layerLabel: null,
      scfLabel: null,
      functionTag: null,
      functionLabel: null,
      heldLead: moment.heldLead,
      leadPitch,
      pillarLabel,
      roleLabel,
      narrative: pillar
        ? 'No chord yet under this moment — pick a suggestion or apply best.'
        : 'No pillar under this moment — add or extend a home chord first.',
      bestAltHint: candidates[0]
        ? `Top suggestion: ${chordTitle(candidates[0].rootPc, candidates[0].natureId, candidates[0].voicing, preferFlats)}`
        : null,
      stackId: null,
    }
  }

  const nextPillar = project.pillars
    .filter((p) => p.startTick >= (pillar?.endTick ?? stack.startTick + 1))
    .sort((a, b) => a.startTick - b.startTick)[0]
  const tag = functionTagForStack(stack, {
    pillarRoot: pillar?.rootPc ?? null,
    nextPillarRoot: nextPillar?.rootPc ?? null,
  })
  const taught = teachStackAnalysis(project, stack.id)
  const roman = romanLabelForStack(project, stack.id)
  const top = candidates[0]
  const bestAltHint = top
    ? altDiffersHint(stack, top, preferFlats)
    : null

  return {
    kind: 'stack',
    title: chordTitle(stack.rootPc, stack.natureId, stack.voicing, preferFlats),
    roman,
    voicing: stack.voicing?.trim() || null,
    voicingLegend: 'bass→tenor',
    layerLabel: stack.layer === 'passing' ? 'Passing' : 'Home family',
    scfLabel: stack.scfGroup != null ? `SCF G${stack.scfGroup}` : null,
    functionTag: tag,
    functionLabel: functionLabel(tag),
    heldLead: moment.heldLead,
    leadPitch,
    pillarLabel,
    roleLabel,
    narrative: taught?.body ?? null,
    bestAltHint,
    stackId: stack.id,
  }
}
