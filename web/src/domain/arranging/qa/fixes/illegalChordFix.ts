import type {
  ArrangementProject,
  ChordStack,
  MelodyEvent,
  Pillar,
} from '../../types'
import type { ArrangementLint } from '../types'
import type { IdGenerator } from '../../../../ports/IdGenerator'
import { candidatesForMelodyNote, candidateToStack } from '../../harmonize'
import type { RankerDeps } from '../../harmonize'
import type { HarmonizeCandidate } from '../../harmonize/types'

export type ProjectPatch = {
  stacks?: ChordStack[]
  melody?: MelodyEvent[]
  pillars?: Pillar[]
  tonality?: number
}

export type FixContext = {
  idGen?: IdGenerator
  rankerDeps?: RankerDeps
  /** When true, allow transpose / destructive melody edits. */
  confirmDestructive?: boolean
}

export interface FixStrategy {
  readonly ruleId: string
  canFix(lint: ArrangementLint, project: ArrangementProject): boolean
  apply(lint: ArrangementLint, project: ArrangementProject, ctx?: FixContext): ProjectPatch | null
}

export function applyPatch(project: ArrangementProject, patch: ProjectPatch): ArrangementProject {
  return {
    ...project,
    stacks: patch.stacks ?? project.stacks,
    melody: patch.melody ?? project.melody,
    pillars: patch.pillars ?? project.pillars,
    tonality: patch.tonality ?? project.tonality,
  }
}

function noteForStack(project: ArrangementProject, stack: ChordStack): MelodyEvent | null {
  return (
    project.melody.find(
      (n) => n.startTick === stack.startTick && n.midi === (stack.midi?.lead ?? n.midi),
    ) ??
    project.melody.find((n) => n.startTick === stack.startTick) ??
    null
  )
}

function pillarForNote(project: ArrangementProject, note: MelodyEvent) {
  return (
    project.pillars.find((p) => p.startTick <= note.startTick && note.startTick < p.endTick) ?? null
  )
}

function bestCandidates(
  project: ArrangementProject,
  note: MelodyEvent,
  ctx?: FixContext,
  preferNature?: string,
): { cands: HarmonizeCandidate[]; pillar: Pillar } | null {
  const pillar = pillarForNote(project, note)
  if (!pillar) return null
  const prev = [...project.stacks]
    .filter((s) => s.startTick < note.startTick)
    .sort((a, b) => b.startTick - a.startTick)[0]
  const nextPillar = project.pillars.find((x) => x.startTick >= pillar.endTick)
  let cands = candidatesForMelodyNote({
    note,
    pillar,
    tonality: project.tonality,
    mode: project.tonalityMode ?? 'major',
    prevRootPc: prev?.rootPc ?? null,
    prevNatureId: prev?.natureId ?? null,
    preferScf: note.role === 'smn',
    limit: 24,
    profile: project.contestProfile,
    nextPillarRoot: nextPillar?.rootPc ?? null,
    prevMidi: prev?.midi ?? null,
    rankerDeps: ctx?.rankerDeps,
  })
  if (preferNature) {
    const preferred = cands.filter((c) => c.natureId === preferNature)
    if (preferred.length) cands = preferred
  }
  return { cands, pillar }
}

function replaceStack(
  project: ArrangementProject,
  stack: ChordStack,
  note: MelodyEvent,
  cand: HarmonizeCandidate,
  pillarId: string,
  ctx?: FixContext,
): ProjectPatch {
  const replacement = candidateToStack(note, cand, pillarId, ctx?.idGen)
  replacement.id = stack.id
  return { stacks: project.stacks.map((s) => (s.id === stack.id ? replacement : s)) }
}

function pcCount(c: HarmonizeCandidate): number {
  return new Set(
    [c.midi.bass, c.midi.bari, c.midi.lead, c.midi.tenor].map((m) => ((m % 12) + 12) % 12),
  ).size
}

/** Replace illegal nature with nearest legal ranked candidate. */
export const illegalChordFix: FixStrategy = {
  ruleId: 'illegal-nature',
  canFix(lint, project) {
    if (lint.ruleId !== 'illegal-nature' || !lint.stackId) return false
    const stack = project.stacks.find((s) => s.id === lint.stackId)
    if (!stack) return false
    const note = noteForStack(project, stack)
    if (!note) return false
    const hit = bestCandidates(project, note)
    return !!hit?.cands[0]
  },
  apply(lint, project, ctx) {
    const stack = project.stacks.find((s) => s.id === lint.stackId)
    if (!stack) return null
    const note = noteForStack(project, stack)
    if (!note) return null
    const hit = bestCandidates(project, note, ctx)
    if (!hit?.cands[0]) return null
    return replaceStack(project, stack, note, hit.cands[0], hit.pillar.id, ctx)
  },
}

/** Drop orphan stacks with no melody. */
export const orphanStackFix: FixStrategy = {
  ruleId: 'orphan-stack',
  canFix(lint, project) {
    return lint.ruleId === 'orphan-stack' && !!lint.stackId && project.stacks.some((s) => s.id === lint.stackId)
  },
  apply(lint, project) {
    return { stacks: project.stacks.filter((s) => s.id !== lint.stackId) }
  },
}

/** Re-voice when tenor below lead / VL error — pick first candidate that clears tenor>lead. */
export const voiceLeadingFix: FixStrategy = {
  ruleId: 'voice-leading',
  canFix(lint, project) {
    if (lint.ruleId !== 'voice-leading' || !lint.stackId) return false
    const stack = project.stacks.find((s) => s.id === lint.stackId)
    if (!stack) return false
    const note = noteForStack(project, stack)
    if (!note) return false
    const hit = bestCandidates(project, note, undefined, stack.natureId)
    return !!hit?.cands.find((c) => c.midi.tenor > c.midi.lead && c.midi.bass <= Math.min(c.midi.bari, c.midi.lead))
  },
  apply(lint, project, ctx) {
    const stack = project.stacks.find((s) => s.id === lint.stackId)
    if (!stack) return null
    const note = noteForStack(project, stack)
    if (!note) return null
    const hit = bestCandidates(project, note, ctx, stack.natureId)
    if (!hit) return null
    const better =
      hit.cands.find(
        (c) => c.midi.tenor > c.midi.lead && c.midi.bass <= Math.min(c.midi.bari, c.midi.lead),
      ) ?? hit.cands.find((c) => c.midi.tenor > c.midi.lead)
    if (!better) return null
    return replaceStack(project, stack, note, better, hit.pillar.id, ctx)
  },
}

/** Soft-replace aug primary with stronger alternative. */
export const augPillarFix: FixStrategy = {
  ruleId: 'aug-pillar',
  canFix(lint, project) {
    if (lint.ruleId !== 'aug-pillar' || !lint.stackId) return false
    const stack = project.stacks.find((s) => s.id === lint.stackId)
    if (!stack) return false
    const note = noteForStack(project, stack)
    if (!note) return false
    const hit = bestCandidates(project, note)
    return !!hit?.cands.find((c) => c.natureId !== 'aug')
  },
  apply(lint, project, ctx) {
    const stack = project.stacks.find((s) => s.id === lint.stackId)
    if (!stack) return null
    const note = noteForStack(project, stack)
    if (!note) return null
    const hit = bestCandidates(project, note, ctx)
    const better = hit?.cands.find((c) => c.natureId !== 'aug')
    if (!hit || !better) return null
    return replaceStack(project, stack, note, better, hit.pillar.id, ctx)
  },
}

/** Insert secondary-dominant flavor by re-picking toward next pillar as BS7. */
export const fewSeventhsFix: FixStrategy = {
  ruleId: 'few-sevenths',
  canFix(lint, project) {
    if (lint.ruleId !== 'few-sevenths' || project.stacks.length < 4) return false
    return findSeventhReplacement(project) != null
  },
  apply(_lint, project, ctx) {
    return findSeventhReplacement(project, ctx)
  },
}

function findSeventhReplacement(
  project: ArrangementProject,
  ctx?: FixContext,
): ProjectPatch | null {
  const sorted = [...project.stacks].sort((a, b) => a.startTick - b.startTick)
  for (let i = 0; i < sorted.length - 1; i++) {
    const s = sorted[i]!
    if (s.natureId === 'seventh' || s.natureId === 'ninth') continue
    const note = noteForStack(project, s)
    if (!note) continue
    const hit = bestCandidates(project, note, ctx, 'seventh')
    if (!hit) continue
    const sevenths = hit.cands.filter((c) => c.natureId === 'seventh')
    if (!sevenths.length) continue

    // Prefer true secondary-dom: BS7 a P5 above the next pillar
    const nextPillar =
      project.pillars
        .filter((p) => p.startTick > s.startTick)
        .sort((a, b) => a.startTick - b.startTick)[0] ??
      project.pillars.find((p) => p.startTick <= s.startTick && s.startTick < p.endTick)
    const preferredRoot =
      nextPillar != null ? (((nextPillar.rootPc + 7) % 12) + 12) % 12 : null
    const seventh =
      (preferredRoot != null
        ? sevenths.find((c) => c.rootPc === preferredRoot)
        : undefined) ?? sevenths[0]!

    return replaceStack(project, s, note, seventh, hit.pillar.id, ctx)
  }
  return null
}

/** Dom9 thin voicing — prefer omit-root (bass on 5th; Prietto/BAM), then omit-5, with ≥4 PCs. */
export const thinNinthPreferFix: FixStrategy = {
  ruleId: 'thin-ninth',
  canFix(lint, project) {
    if (lint.ruleId !== 'thin-ninth' || !lint.stackId) return false
    const stack = project.stacks.find((s) => s.id === lint.stackId)
    if (!stack) return false
    const note = noteForStack(project, stack)
    if (!note) return false
    const hit = bestCandidates(project, note, undefined, 'ninth')
    return !!hit?.cands.find((c) => pcCount(c) >= 4)
  },
  apply(lint, project, ctx) {
    const stack = project.stacks.find((s) => s.id === lint.stackId)
    if (!stack) return null
    const note = noteForStack(project, stack)
    if (!note) return null
    const hit = bestCandidates(project, note, ctx, 'ninth')
    if (!hit) return null
    const fat = hit.cands.filter((c) => pcCount(c) >= 4)
    const omitRoot = fat.find((c) => c.voicing.startsWith('5'))
    const omit5 = fat.find((c) => c.voicing.startsWith('1'))
    const better = omitRoot ?? omit5 ?? fat[0]
    if (!better) return null
    return replaceStack(project, stack, note, better, hit.pillar.id, ctx)
  },
}

/** Re-voice doubled chordal third. */
export const doubledThirdFix: FixStrategy = {
  ruleId: 'doubled-third',
  canFix(lint, project) {
    if (lint.ruleId !== 'doubled-third' || !lint.stackId) return false
    const stack = project.stacks.find((s) => s.id === lint.stackId)
    if (!stack) return false
    const note = noteForStack(project, stack)
    if (!note) return false
    const hit = bestCandidates(project, note, undefined, stack.natureId)
    return !!hit?.cands[0]
  },
  apply(lint, project, ctx) {
    const stack = project.stacks.find((s) => s.id === lint.stackId)
    if (!stack) return null
    const note = noteForStack(project, stack)
    if (!note) return null
    const hit = bestCandidates(project, note, ctx, stack.natureId)
    if (!hit?.cands[0]) return null
    return replaceStack(project, stack, note, hit.cands[0], hit.pillar.id, ctx)
  },
}

/** Dull harmonicity → swap to better ringing candidate. */
export const dullHarmonicityFix: FixStrategy = {
  ruleId: 'dull-harmonicity',
  canFix(lint, project) {
    if (lint.ruleId !== 'dull-harmonicity' || !lint.stackId) return false
    const stack = project.stacks.find((s) => s.id === lint.stackId)
    if (!stack) return false
    const note = noteForStack(project, stack)
    if (!note) return false
    const hit = bestCandidates(project, note)
    return !!hit?.cands[0]
  },
  apply(lint, project, ctx) {
    const stack = project.stacks.find((s) => s.id === lint.stackId)
    if (!stack) return null
    const note = noteForStack(project, stack)
    if (!note) return null
    const hit = bestCandidates(project, note, ctx)
    if (!hit?.cands[0]) return null
    return replaceStack(project, stack, note, hit.cands[0], hit.pillar.id, ctx)
  },
}

export { keySuggestionFix, leadRangeFix } from './transposeFixes'
