/**
 * Contest suitability heuristic — “how barbershop is this?”
 *
 * Scores each 3–4 part stack at a lead onset from the lead tone and the
 * surrounding chord tones. Skips counterpoint / rounds / solos / pickups.
 */
import { BARBERSHOP_CHORDS, leadRoleInChord } from './chords'
import { isNatureAllowed, ringTier } from './contestProfile'
import { leadAllowsCounterpartSwap } from './counterpart'
import { isSecondaryDominantSeventh } from './secondaryDominant'
import type { ArrangementProject, ChordStack } from './types'

export type BarbershopnessFactor = {
  id: string
  label: string
  /** Weighted contribution already multiplied (points toward 100). */
  points: number
  weight: number
  raw: number
  detail?: string
}

export type StackBarbershopness = {
  stackId: string
  startTick: number
  partCount: number
  /** 0–100 for this stack alone. */
  score: number
  notes: string[]
}

export type BarbershopnessReport = {
  /** Aggregate 0–100 contest-suitability score. */
  score: number
  factors: BarbershopnessFactor[]
  stacks: StackBarbershopness[]
  summary: string
  scoredStackCount: number
  skippedThin: number
}

function partCount(stack: ChordStack): number {
  if (!stack.midi) return 0
  const parts = [stack.midi.bass, stack.midi.bari, stack.midi.lead, stack.midi.tenor]
  return parts.filter((m) => Number.isFinite(m)).length
}

function distinctPcs(stack: ChordStack): number {
  if (!stack.midi) return 0
  return new Set(
    [stack.midi.bass, stack.midi.bari, stack.midi.lead, stack.midi.tenor].map(
      (m) => ((m % 12) + 12) % 12,
    ),
  ).size
}

function ttbbOrderOk(stack: ChordStack): boolean {
  const m = stack.midi
  if (!m) return false
  return m.tenor > m.lead && m.bass <= Math.min(m.bari, m.lead)
}

function leadStrong(stack: ChordStack): number {
  if (!stack.midi) return 0
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === stack.natureId)
  if (!chord) return 0.3
  const role = leadRoleInChord(chord, stack.rootPc, stack.midi.lead)
  if (role == null) return 0
  if (stack.natureId === 'seventh' || stack.natureId === 'ninth' || stack.natureId === 'm7') {
    return role === 3 || role === 7 ? 1 : role === 1 || role === 5 ? 0.35 : 0.5
  }
  if (stack.natureId === 'major' || stack.natureId === 'minor') {
    return role === 3 ? 1 : role === 1 ? 0.65 : 0.4
  }
  return 0.55
}

function scoreOneStack(
  stack: ChordStack,
  project: ArrangementProject,
  nextPillarRoot: number | null,
): StackBarbershopness | null {
  const parts = partCount(stack)
  if (parts < 3 || !stack.midi) return null

  const notes: string[] = []
  let total = 0
  let weightSum = 0

  const add = (w: number, raw: number, note?: string) => {
    total += w * raw
    weightSum += w
    if (note) notes.push(note)
  }

  const legal = isNatureAllowed(project.contestProfile, stack.natureId) ? 1 : 0
  add(2.5, legal, legal ? undefined : `Nature ${stack.natureId} outside ${project.contestProfile}`)

  const isBs7 = stack.natureId === 'seventh' || stack.natureId === 'ninth' ? 1 : 0
  add(2.0, isBs7)

  const strong = leadStrong(stack)
  add(2.0, strong, strong < 0.5 ? 'Lead on weak chord tone' : undefined)

  const order = ttbbOrderOk(stack) ? 1 : 0
  add(1.5, order, order ? undefined : 'TTBB order broken')

  const pcs = distinctPcs(stack)
  if (stack.natureId === 'ninth') {
    const fat = pcs >= 4 ? 1 : 0
    add(1.5, fat, fat ? undefined : 'Dom9 thinner than 4 pitch classes')
  } else {
    add(0.75, pcs >= 3 ? 1 : 0.3)
  }

  if (nextPillarRoot != null && isBs7) {
    const sec = isSecondaryDominantSeventh({
      rootPc: stack.rootPc,
      natureId: stack.natureId,
      targetRoot: nextPillarRoot,
    })
      ? 1
      : 0
    add(1.25, sec)
  }

  if (stack.scfGroup === 5 || stack.ruleTags.includes('R3_tritone')) {
    const ok = leadAllowsCounterpartSwap({
      originalRoot: counterpartOriginal(stack, project),
      leadMidi: stack.midi.lead,
    })
      ? 1
      : 0.2
    add(1.0, ok, ok < 1 ? 'Counterpart swap on weak melody tone' : undefined)
  }

  const ring = Math.max(0, 1 - (ringTier(stack.natureId) - 1) / 6)
  add(1.0, ring)

  const score = weightSum > 0 ? Math.round((100 * total) / weightSum) : 0
  return {
    stackId: stack.id,
    startTick: stack.startTick,
    partCount: parts,
    score,
    notes,
  }
}

function counterpartOriginal(stack: ChordStack, project: ArrangementProject): number {
  if (stack.pillarId) {
    const p = project.pillars.find((x) => x.id === stack.pillarId)
    if (p) return p.rootPc
  }
  // Counterpart of current root if we only know the swapped stack
  return (((stack.rootPc + 6) % 12) + 12) % 12
}

function nextPillarRootAt(project: ArrangementProject, tick: number): number | null {
  const sorted = [...project.pillars].sort((a, b) => a.startTick - b.startTick)
  const next = sorted.find((p) => p.startTick > tick)
  if (next) return next.rootPc
  const cur = sorted.find((p) => p.startTick <= tick && tick < p.endTick)
  return cur?.rootPc ?? null
}

/**
 * Aggregate contest-suitability from 3–4 part stacks under lead onsets.
 */
export function assessBarbershopness(project: ArrangementProject): BarbershopnessReport {
  const stacks = [...project.stacks].sort((a, b) => a.startTick - b.startTick)
  const scored: StackBarbershopness[] = []
  let skippedThin = 0

  for (const stack of stacks) {
    if (partCount(stack) < 3 || !stack.midi) {
      skippedThin++
      continue
    }
    const one = scoreOneStack(stack, project, nextPillarRootAt(project, stack.startTick))
    if (one) scored.push(one)
  }

  if (!scored.length) {
    return {
      score: 0,
      factors: [],
      stacks: [],
      summary: 'No 3–4 part stacks to score — add voicings under the lead.',
      scoredStackCount: 0,
      skippedThin,
    }
  }

  const avg = scored.reduce((s, x) => s + x.score, 0) / scored.length
  const bs7Share =
    stacks.filter((s) => s.natureId === 'seventh' || s.natureId === 'ninth').length /
    Math.max(1, stacks.length)
  const legalShare =
    stacks.filter((s) => isNatureAllowed(project.contestProfile, s.natureId)).length /
    Math.max(1, stacks.length)
  const strongLeadShare =
    scored.filter((s) => !s.notes.some((n) => n.includes('weak chord tone'))).length /
    scored.length

  const factors: BarbershopnessFactor[] = [
    {
      id: 'stack_avg',
      label: 'Per-stack chord quality',
      weight: 4,
      raw: avg / 100,
      points: avg * 0.55,
      detail: `${scored.length} stacks scored`,
    },
    {
      id: 'bs7_density',
      label: 'Barbershop-seventh density',
      weight: 2,
      raw: Math.min(1, bs7Share / 0.3),
      points: Math.min(1, bs7Share / 0.3) * 20,
      detail: `${Math.round(bs7Share * 100)}% BS7 (target ~30%)`,
    },
    {
      id: 'vocabulary',
      label: 'Contest vocabulary',
      weight: 2,
      raw: legalShare,
      points: legalShare * 15,
    },
    {
      id: 'lead_strength',
      label: 'Lead on strong chord tones',
      weight: 1.5,
      raw: strongLeadShare,
      points: strongLeadShare * 10,
    },
  ]

  const score = Math.max(
    0,
    Math.min(100, Math.round(factors.reduce((s, f) => s + f.points, 0))),
  )

  let summary: string
  if (score >= 80) summary = 'Strong contest barbershop character in the voiced stacks.'
  else if (score >= 60) summary = 'Recognizably barbershop; tighten sevenths and lead tones.'
  else if (score >= 40) summary = 'Mixed character — more BS7 approaches and legal natures needed.'
  else summary = 'Weak contest fit — stacks lack classic barbershop chord color.'

  return {
    score,
    factors,
    stacks: scored,
    summary,
    scoredStackCount: scored.length,
    skippedThin,
  }
}
