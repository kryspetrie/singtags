/**
 * Wire guided-step transport actions (shared by dock + roll mirror).
 */
import type { Ref } from 'vue'
import type { GuidedStepId } from '../application/arranging/GuidedSteps'
import type { HarmonizeCandidate } from '../domain/arranging/harmonize'

export type CoachTransportActionCtx = {
  guidedStep: Ref<GuidedStepId>
  focusTab: Ref<'home' | 'now' | 'choose' | 'check' | 'polish'>
  currentStack: Ref<{ midi?: unknown } | null>
  filteredCandidates: Ref<readonly HarmonizeCandidate[]>
  stepPillar: (dir: -1 | 1) => void
  stepMelodyNote: (dir: -1 | 1) => void
  stepMoment: (dir: -1 | 1) => void
  stepLint: (dir: -1 | 1) => void
  stepNextGap: () => void
  stepNextProblem: () => void
  onProposeNext: () => void
  onLabelRoles: () => void
  /** Home → Chords (or other continue). */
  goChords: () => void
  applyBest: () => void
  fixAllSafe: () => void
  onStrengthen: () => void
  hearPillarRoot: () => void
  hearCurrentStack: () => void
  hearCand: (c: HarmonizeCandidate) => void
  /** Chords: hear selected suggest row (falls back inside if omitted). */
  hearSelectedSuggest?: () => void
}

export function createCoachTransportActions(ctx: CoachTransportActionCtx) {
  function prev(): void {
    switch (ctx.guidedStep.value) {
      case 'chords':
        ctx.focusTab.value = 'choose'
        ctx.stepMoment(-1)
        break
      case 'check':
        ctx.stepLint(-1)
        break
    }
  }

  function next(): void {
    switch (ctx.guidedStep.value) {
      case 'chords':
        ctx.focusTab.value = 'choose'
        ctx.stepMoment(1)
        break
      case 'check':
        ctx.stepLint(1)
        break
    }
  }

  function primary(): void {
    switch (ctx.guidedStep.value) {
      case 'home':
        ctx.goChords()
        break
      case 'chords':
        ctx.focusTab.value = 'choose'
        ctx.applyBest()
        break
      case 'check':
        ctx.fixAllSafe()
        break
      default:
        ctx.onStrengthen()
    }
  }

  function hear(): void {
    if (ctx.guidedStep.value === 'chords') {
      ctx.focusTab.value = 'choose'
      if (ctx.hearSelectedSuggest) {
        ctx.hearSelectedSuggest()
        return
      }
      if (ctx.currentStack.value?.midi) ctx.hearCurrentStack()
      else if (ctx.filteredCandidates.value[0]) ctx.hearCand(ctx.filteredCandidates.value[0]!)
    }
  }

  function secondary(): void {
    if (ctx.guidedStep.value === 'chords') {
      ctx.focusTab.value = 'choose'
      ctx.stepNextGap()
      return
    }
    if (ctx.guidedStep.value === 'check') {
      ctx.focusTab.value = 'check'
      ctx.stepNextProblem()
    }
  }

  return { prev, next, primary, hear, secondary }
}
