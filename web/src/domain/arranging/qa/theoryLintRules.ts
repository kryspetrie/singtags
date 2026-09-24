/**
 * Theory-teaching lint rules (spacing, tension, BS7 density).
 */
import type { ArrangementLint, LintRule } from './types'
import { analyzeHarmonyTheory } from '../analyzeHarmonyTheory'
import { cadenceMissMessage } from '../cadences'

export const theorySpacingRule: LintRule = {
  id: 'theory-spacing',
  check(project) {
    return analyzeHarmonyTheory(project).issues
      .filter((i) => i.source === 'spacing')
      .map(
        (i): ArrangementLint => ({
          id: i.id,
          ruleId: 'theory-spacing',
          severity: i.severity,
          message: i.message,
          stackId: i.stackId,
          teachingId: i.teachingId,
        }),
      )
  },
}

export const theoryTensionRule: LintRule = {
  id: 'theory-tension',
  check(project) {
    return analyzeHarmonyTheory(project).issues
      .filter((i) => i.source === 'tension')
      .map(
        (i): ArrangementLint => ({
          id: i.id,
          ruleId: 'theory-tension',
          severity: i.severity,
          message: i.message,
          stackId: i.stackId,
          teachingId: i.teachingId,
        }),
      )
  },
}

export const bs7DensityRule: LintRule = {
  id: 'bs7-density',
  check(project) {
    if (project.stacks.length < 4) return []
    const bs7 = project.stacks.filter(
      (s) => s.natureId === 'seventh' || s.natureId === 'ninth',
    ).length
    const share = bs7 / project.stacks.length
    if (share >= 0.3) return []
    return [
      {
        id: 'bs7-density-low',
        ruleId: 'bs7-density',
        severity: 'warn',
        message: `Only ${Math.round(share * 100)}% dominant sevenths — contest barbershop often aims near 30%+.`,
        teachingId: 'bs7',
        data: { share, target: 0.3 },
      },
    ]
  },
}

/** Duration-weighted BS7 share (info) — complements chord-count `bs7-density`. */
export const bs7DensityDurationRule: LintRule = {
  id: 'bs7-density-duration',
  check(project) {
    if (project.stacks.length < 4) return []
    let total = 0
    let bs7Ticks = 0
    for (const s of project.stacks) {
      total += s.durationTicks
      if (s.natureId === 'seventh' || s.natureId === 'ninth') bs7Ticks += s.durationTicks
    }
    if (total <= 0) return []
    const share = bs7Ticks / total
    if (share >= 1 / 3) return []
    return [
      {
        id: 'bs7-density-duration-low',
        ruleId: 'bs7-density-duration',
        severity: 'info',
        message: `Dominant sevenths cover ${Math.round(share * 100)}% of duration — traditional guidance is often ~⅓+.`,
        teachingId: 'bs7',
        data: { share, target: 1 / 3 },
      },
    ]
  },
}

/** Soft warn when two dim7s chain consecutively. */
export const dim7ChainRule: LintRule = {
  id: 'dim7-chain',
  check(project) {
    const sorted = [...project.stacks].sort((a, b) => a.startTick - b.startTick)
    const out: ArrangementLint[] = []
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1]!
      const b = sorted[i]!
      if (a.natureId === 'dim7' && b.natureId === 'dim7') {
        out.push({
          id: `dim7-chain-${a.id}-${b.id}`,
          ruleId: 'dim7-chain',
          severity: 'info',
          message: 'Two diminished sevenths in a row — prefer resolving a dim7 into BS7/m6/major.',
          stackId: b.id,
          teachingId: 'R4_dim7',
        })
      }
    }
    return out
  },
}

/** Rapid counterpart flicker at high tempo. */
export const counterpartFlickerRule: LintRule = {
  id: 'counterpart-flicker',
  check(project) {
    if (project.bpm < 140) return []
    const sorted = [...project.stacks].sort((a, b) => a.startTick - b.startTick)
    const out: ArrangementLint[] = []
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1]!
      const b = sorted[i]!
      const bothDom =
        (a.natureId === 'seventh' || a.natureId === 'ninth') &&
        (b.natureId === 'seventh' || b.natureId === 'ninth')
      if (!bothDom) continue
      const tritone = (((a.rootPc - b.rootPc) % 12) + 12) % 12 === 6
      if (!tritone) continue
      if (a.durationTicks < 240 || b.durationTicks < 240) {
        out.push({
          id: `counterpart-flicker-${a.id}-${b.id}`,
          ruleId: 'counterpart-flicker',
          severity: 'info',
          message: 'Fast-tempo counterpart flicker — prefer a sustained block when the pocket is quick.',
          stackId: b.id,
          teachingId: 'counterpart',
        })
      }
    }
    return out
  },
}

/**
 * Soft Check nudge when a locked stack breaks an obvious ^5→^1 authentic cadence.
 */
export const cadenceMissRule: LintRule = {
  id: 'cadence-miss',
  check(project) {
    const mode = project.tonalityMode ?? 'major'
    const melody = [...project.melody].sort((a, b) => a.startTick - b.startTick)
    if (melody.length < 2) return []
    const stacks = [...project.stacks].sort((a, b) => a.startTick - b.startTick)
    const out: ArrangementLint[] = []
    for (let i = 0; i < melody.length - 1; i++) {
      const a = melody[i]!
      const b = melody[i + 1]!
      const stack = stacks.find(
        (s) =>
          s.startTick <= a.startTick &&
          a.startTick < s.startTick + Math.max(1, s.durationTicks),
      )
      if (!stack) continue
      const miss = cadenceMissMessage(
        { rootPc: stack.rootPc, natureId: stack.natureId },
        {
          tonality: project.tonality,
          mode,
          melodyMidi: a.midi,
          nextMelodyMidi: b.midi,
        },
      )
      if (!miss) continue
      out.push({
        id: `${miss.id}-${stack.id}`,
        ruleId: 'cadence-miss',
        severity: 'info',
        message: miss.message,
        stackId: stack.id,
        noteId: a.id,
        teachingId: miss.teachingId,
        data: miss.suggest
          ? { suggestRootPc: miss.suggest.rootPc, suggestNatureId: miss.suggest.natureId }
          : undefined,
      })
    }
    return out
  },
}
