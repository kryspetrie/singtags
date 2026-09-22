/**
 * Bridge Coach dock stepping → piano-roll transport overlay.
 */
import { watch, type Ref, type ComputedRef } from 'vue'
import type { HarmonicMoment } from '../../domain/arranging/harmonicMoments'
import type { CoachFocusTab } from '../../domain/arranging/nextCoachAction'
import type { MomentContextDto } from '../../application/arranging/CoachContext'
import type { ArrangementLint } from '../../domain/arranging/qa'
import {
  clearCoachRollNavState,
  publishCoachRollNavState,
  registerCoachRollNav,
} from './coachRollNav'

export function bindCoachRollNav(opts: {
  focusTab: Ref<CoachFocusTab>
  momIndex: ComputedRef<number>
  moments: ComputedRef<HarmonicMoment[]>
  momentContext: ComputedRef<MomentContextDto | null>
  noteLints: ComputedRef<ArrangementLint[]>
  emptyCount: ComputedRef<number>
  unrecognizedCount: ComputedRef<number>
  repairTour: ComputedRef<boolean>
  stepMoment: (dir: -1 | 1) => void
  stepNextGap: () => void
  stepNextIssue: () => void
  stepNextProblem: () => void
}): () => void {
  const unregister = registerCoachRollNav({
    stepMoment: opts.stepMoment,
    stepNextGap: opts.stepNextGap,
    stepNextIssue: opts.stepNextIssue,
    stepNextProblem: opts.stepNextProblem,
  })
  const stop = watch(
    [
      opts.focusTab,
      opts.momIndex,
      opts.moments,
      opts.momentContext,
      opts.noteLints,
      opts.emptyCount,
      opts.unrecognizedCount,
      opts.repairTour,
    ],
    () => {
      const chordMode = opts.focusTab.value === 'choose'
      const issueMode = opts.focusTab.value === 'check'
      publishCoachRollNavState({
        active: chordMode || issueMode,
        chordMode,
        issueMode,
        repairTour: opts.repairTour.value && issueMode,
        momentIndex: opts.momIndex.value,
        momentCount: opts.moments.value.length,
        emptyCount: opts.emptyCount.value,
        unrecognizedCount: opts.unrecognizedCount.value,
        momentLabel: opts.momentContext.value?.title ?? '',
        issueCount: opts.noteLints.value.length,
      })
    },
    { immediate: true },
  )
  return () => {
    stop()
    unregister()
    clearCoachRollNavState()
  }
}
