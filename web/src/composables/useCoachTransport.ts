/**
 * Shared coach transport model — one nav strip per guided step (Home → Polish).
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

    if (step === 'home') {
      return {
        ...empty,
        status: 'Workflow overview - then Chords > Check > Polish',
        primaryLabel: 'Start Chords',
        primaryTitle: 'Begin walking Lead moments',
        primaryDisabled: false,
      }
    }

    if (step === 'chords') {
      return {
        ...empty,
        // Optional short teach cue (e.g. cadence label) - never Moment X/Y counts.
        status: opts.momentStatus.value,
        showNav: true,
        prevLabel: 'Prev',
        nextLabel: 'Next',
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
        prevLabel: 'Prev issue',
        nextLabel: 'Next issue',
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

    if (step === 'auto') {
      return {
        ...empty,
        status: 'Whole-chart passes — strengthen, polish inversions, then audition',
        primaryLabel: 'Polish inversions',
        primaryTitle: 'Revoice stacks along a global inversion path',
        primaryDisabled: false,
      }
    }

    // polish (and any unknown step)
    return {
      ...empty,
      status: 'Skim the checklist — export from the Tag Studio toolbar',
      primaryLabel: '',
      primaryTitle: '',
      primaryDisabled: true,
    }
  })
}
