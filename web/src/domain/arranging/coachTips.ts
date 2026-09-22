/**
 * Per-wizard-step coach tips — backed by education curriculum when available.
 */
import type { WizardStep } from './types'
import { teachWizardStep } from './education'
import type { CoachTip } from './coachTipsTypes'

export type { CoachTip } from './coachTipsTypes'

export type CoachUiPhase = 'pillars' | 'walk'
/** Session lenses — Arrange (build) vs Review (check/polish). */
export type CoachUiMode = 'arrange' | 'review'

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
    body: 'Mark home roots under phrases — not full chords yet. Lock with your ear, then walk chord choices moment by moment.',
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
      body: 'Check issues and polish. Switch to Arrange when you want ranked chord suggestions under locked home roots.',
    }
  }
  if (opts.phase === 'pillars' || !opts.hasPillars) {
    return {
      step: 'step1_roots',
      title: 'Mark home roots',
      body: 'A pillar is a home root under a phrase — not a full chord. Propose the next draft, Hear, then Lock.',
    }
  }
  if (opts.wizardStep) return tipForStep(opts.wizardStep)
  return {
    step: 'step3_pmn_pcf',
    title: 'Choose chords',
    body: 'Follow the path (pillars → roles → chords) or jump tabs freely. Hear suggestions and Apply one moment at a time.',
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
