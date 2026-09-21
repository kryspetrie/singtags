/**
 * Unified harmony-theory analysis for a project (VL + spacing + tension).
 */
import { analyzeSpacing, type SpacingIssue } from './spacing/harmonicSeriesSpacing'
import { analyzeTensionRelease, functionTagForStack, type TensionIssue } from './tensionRelease'
import { analyzeVoiceLeading, type VoiceLeadingIssue } from './voiceLeading'
import { romanForChordDetailed } from './secondaryDominant'
import { pillarAtTick } from './pillars'
import type { ArrangementProject, ChordStack } from './types'

export type TheoryIssue = {
  id: string
  severity: 'error' | 'warn' | 'info'
  message: string
  stackId?: string
  prevStackId?: string
  teachingId?: string
  source: 'voiceLeading' | 'spacing' | 'tension'
}

export type StackTheoryLabel = {
  stackId: string
  roman: string
  altRoman?: string
  functionTag: ReturnType<typeof functionTagForStack>
}

export type HarmonyTheoryReport = {
  issues: TheoryIssue[]
  labels: StackTheoryLabel[]
}

function mapVl(i: VoiceLeadingIssue): TheoryIssue {
  return {
    id: i.id,
    severity: i.severity,
    message: i.message,
    stackId: i.stackId,
    prevStackId: i.prevStackId,
    teachingId: i.teachingId,
    source: 'voiceLeading',
  }
}

function mapSp(i: SpacingIssue): TheoryIssue {
  return {
    id: i.id,
    severity: i.severity,
    message: i.message,
    stackId: i.stackId,
    teachingId: i.teachingId,
    source: 'spacing',
  }
}

function mapTe(i: TensionIssue): TheoryIssue {
  return {
    id: i.id,
    severity: i.severity,
    message: i.message,
    stackId: i.stackId,
    prevStackId: i.prevStackId,
    teachingId: i.teachingId,
    source: 'tension',
  }
}

export function labelStacks(project: ArrangementProject): StackTheoryLabel[] {
  const sorted = [...project.stacks].sort((a, b) => a.startTick - b.startTick)
  return sorted.map((stack) => {
    const pillar = pillarAtTick(project.pillars, stack.startTick)
    const nextPillar = project.pillars
      .filter((p) => p.startTick > stack.startTick)
      .sort((a, b) => a.startTick - b.startTick)[0]
    const detailed = romanForChordDetailed({
      rootPc: stack.rootPc,
      natureId: stack.natureId,
      tonality: project.tonality,
      mode: project.tonalityMode ?? 'major',
      resolvesToRoot: nextPillar?.rootPc ?? null,
    })
    return {
      stackId: stack.id,
      roman: detailed.roman,
      altRoman: detailed.altRoman,
      functionTag: functionTagForStack(stack, {
        pillarRoot: pillar?.rootPc ?? null,
        nextPillarRoot: nextPillar?.rootPc ?? null,
      }),
    }
  })
}

export function analyzeHarmonyTheory(project: ArrangementProject): HarmonyTheoryReport {
  const issues: TheoryIssue[] = [
    ...analyzeVoiceLeading(project.stacks).map(mapVl),
    ...analyzeSpacing(project.stacks).map(mapSp),
    ...analyzeTensionRelease(project.stacks).map(mapTe),
  ]
  return { issues, labels: labelStacks(project) }
}

export function explainStackTheory(
  project: ArrangementProject,
  stackId: string,
): {
  label: StackTheoryLabel | null
  issues: TheoryIssue[]
  neighbors: { prev?: ChordStack; next?: ChordStack }
} {
  const report = analyzeHarmonyTheory(project)
  const label = report.labels.find((l) => l.stackId === stackId) ?? null
  const issues = report.issues.filter(
    (i) => i.stackId === stackId || i.prevStackId === stackId,
  )
  const sorted = [...project.stacks].sort((a, b) => a.startTick - b.startTick)
  const idx = sorted.findIndex((s) => s.id === stackId)
  return {
    label,
    issues,
    neighbors: {
      prev: idx > 0 ? sorted[idx - 1] : undefined,
      next: idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : undefined,
    },
  }
}
