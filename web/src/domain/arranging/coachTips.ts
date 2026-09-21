/**
 * Per-wizard-step coach tips — backed by education curriculum when available.
 */
import type { WizardStep } from './types'
import { teachWizardStep } from './education'
import type { CoachTip } from './coachTipsTypes'

export type { CoachTip } from './coachTipsTypes'

export type CoachUiPhase = 'pillars' | 'walk'
/** Session lenses — maps to docs Quick / Guided / Review. */
export type CoachUiMode = 'quick' | 'guided' | 'review'

export function tipForStep(step: WizardStep): CoachTip {
  const moment = teachWizardStep(step)
  if (moment) {
    return {
      step,
      title: moment.headline,
      body: moment.body,
      lessonId: moment.lesson?.id,
      glossaryIds: moment.glossary.map((g) => g.id),
      citations: moment.citations.map((c) => c.label + (c.detail ? ` — ${c.detail}` : '')),
    }
  }
  return {
    step,
    title: 'Arranging',
    body: 'Set home (pillar) chords on the timeline, lock them with your ear, then walk chord choices moment by moment.',
  }
}

/** Phase-aware one-liner for the Tag Studio coach dock. */
export function tipForCoachUi(opts: {
  mode: CoachUiMode
  phase: CoachUiPhase
  hasMelody: boolean
  hasPillars: boolean
  wizardStep?: WizardStep
}): CoachTip {
  if (!opts.hasMelody) {
    return {
      step: 'melody',
      title: 'Start with the lead',
      body: 'Close Coach and enter the Lead melody on the roll first. Pillars and chords come after.',
    }
  }
  if (opts.mode === 'review') {
    return {
      step: opts.wizardStep ?? 'step9_final',
      title: 'Review',
      body: 'Check issues and context. Switch to Quick or Guided when you want ranked chord suggestions under pillars.',
    }
  }
  if (opts.mode === 'guided') {
    return {
      step: opts.wizardStep ?? 'step1_roots',
      title: 'Guided',
      body: 'Lock pillars, then choose chords one moment at a time — open Why? when you want the theory.',
    }
  }
  if (opts.phase === 'pillars' || !opts.hasPillars) {
    return {
      step: 'step1_roots',
      title: 'Assign pillars',
      body: 'Pillars are the home chords under each phrase. Suggest spans on the lane, set the root, Hear, then Lock.',
    }
  }
  if (opts.wizardStep) return tipForStep(opts.wizardStep)
  return {
    step: 'step3_pmn_pcf',
    title: 'Choose chords',
    body: 'For each moment, Hear suggestions and Apply. Held lead posts keep the same pitch while other parts change.',
  }
}

export function allCoachTips(): readonly CoachTip[] {
  const steps: WizardStep[] = [
    'melody',
    'step1_roots',
    'step2_confirm',
    'step3_pmn_pcf',
    'step4_smn_pcf',
    'step5_smn_scf',
    'step6_alts',
    'step7_variety',
    'step8_voicing',
    'step9_final',
    'done',
  ]
  return steps.map((s) => tipForStep(s))
}
