/**
 * Shared coach transport model — one nav strip per guided step (Pillars → Polish).
 */
import { computed, type ComputedRef } from 'vue'
import type { GuidedStepId } from '../application/arranging/GuidedSteps'

export type CoachTransportView = {
  stepLabel: string
  status: string
  showNav: boolean
  prevLabel: string
  nextLabel: string
  prevDisabled: boolean
  nextDisabled: boolean
  primaryLabel: string
  primaryTitle: string
  primaryDisabled: boolean
  showHear: boolean
  hearLabel: string
  hearDisabled: boolean
  showLock: boolean
  lockDisabled: boolean
  showSkip: boolean
  skipDisabled: boolean
  /** Optional extra action (e.g. Next empty on Chords / Check). */
  secondaryLabel: string | null
  secondaryTitle: string
  secondaryDisabled: boolean
}

export function useCoachTransport(opts: {
  guidedStep: ComputedRef<GuidedStepId>
  guidedStepLabel: ComputedRef<string>
  pillarStatus: ComputedRef<string>
  momentStatus: ComputedRef<string>
  rolesStatus: ComputedRef<string>
  checkStatus: ComputedRef<string>
  repairTour: ComputedRef<boolean>
  pillarsLen: ComputedRef<number>
  melodyLen: ComputedRef<number>
  momentsLen: ComputedRef<number>
  lintCount: ComputedRef<number>
  emptyMomentCount: ComputedRef<number>
  selectedPil: ComputedRef<{ confirmed: boolean } | null>
  canApplyChord: ComputedRef<boolean>
  hasStackMidi: ComputedRef<boolean>
}): ComputedRef<CoachTransportView> {
  return computed(() => {
    const step = opts.guidedStep.value
    const empty: CoachTransportView = {
      stepLabel: opts.guidedStepLabel.value,
      status: '',
      showNav: false,
      prevLabel: '',
      nextLabel: '',
      prevDisabled: true,
      nextDisabled: true,
      primaryLabel: '',
      primaryTitle: '',
      primaryDisabled: true,
      showHear: false,
      hearLabel: 'Hear',
      hearDisabled: true,
      showLock: false,
      lockDisabled: true,
      showSkip: false,
      skipDisabled: true,
      secondaryLabel: null,
      secondaryTitle: '',
      secondaryDisabled: true,
    }

    if (step === 'pillars') {
      return {
        ...empty,
        status: opts.pillarStatus.value,
        showNav: true,
        prevLabel: '← Pillar',
        nextLabel: 'Pillar →',
        prevDisabled: opts.pillarsLen.value < 1,
        nextDisabled: opts.pillarsLen.value < 1,
        primaryLabel: opts.repairTour.value ? 'Review home roots' : 'Propose next home root',
        primaryTitle: 'One draft home root at a time — Hear, then Lock',
        primaryDisabled: false,
        showHear: true,
        hearLabel: 'Hear root',
        hearDisabled: !opts.selectedPil.value,
        showLock: true,
        lockDisabled: !opts.selectedPil.value || opts.selectedPil.value.confirmed,
        showSkip: true,
        skipDisabled: !opts.selectedPil.value || opts.selectedPil.value.confirmed,
      }
    }

    if (step === 'roles') {
      return {
        ...empty,
        status: opts.rolesStatus.value,
        showNav: true,
        prevLabel: '← Note',
        nextLabel: 'Note →',
        prevDisabled: opts.melodyLen.value < 1,
        nextDisabled: opts.melodyLen.value < 1,
        primaryLabel: 'Auto-label',
        primaryTitle: 'Guess Strong vs Passing from stress and length',
        primaryDisabled: opts.melodyLen.value < 1,
      }
    }

    if (step === 'chords') {
      return {
        ...empty,
        status: opts.momentStatus.value,
        showNav: true,
        prevLabel: '← Moment',
        nextLabel: 'Moment →',
        prevDisabled: opts.momentsLen.value < 1,
        nextDisabled: opts.momentsLen.value < 1,
        primaryLabel: 'Apply best',
        primaryTitle: 'Write the top-ranked voicing into this moment',
        primaryDisabled: !opts.canApplyChord.value,
        showHear: true,
        hearLabel: opts.hasStackMidi.value ? 'Hear stack' : 'Hear best',
        hearDisabled: !opts.canApplyChord.value && !opts.hasStackMidi.value,
        secondaryLabel: 'Next empty',
        secondaryTitle: 'Jump to the next moment without a known chord',
        secondaryDisabled: opts.emptyMomentCount.value < 1,
      }
    }

    if (step === 'check') {
      const repair = opts.repairTour.value
      return {
        ...empty,
        status: opts.checkStatus.value,
        showNav: true,
        prevLabel: '← Issue',
        nextLabel: 'Issue →',
        prevDisabled: opts.lintCount.value < 1,
        nextDisabled: opts.lintCount.value < 1,
        primaryLabel: 'Fix all safe',
        primaryTitle: 'Apply automatic fixes that do not change your intent',
        primaryDisabled: opts.lintCount.value < 1,
        secondaryLabel: repair ? 'Next problem' : 'Next empty',
        secondaryTitle: repair
          ? 'Next QA issue, unrecognized chord, or empty moment'
          : 'Jump to the next empty chord moment',
        secondaryDisabled: repair
          ? opts.lintCount.value + opts.emptyMomentCount.value < 1
          : opts.emptyMomentCount.value < 1,
      }
    }

    return {
      ...empty,
      status: 'Strengthen voicings, skim the checklist, export when ready',
      primaryLabel: 'Strengthen',
      primaryTitle: 'Polish weak voice-leading in place',
      primaryDisabled: false,
    }
  })
}
