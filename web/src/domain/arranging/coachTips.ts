/**
 * Per-wizard-step coach tips — backed by education curriculum when available.
 */
import type { WizardStep } from './types'
import { teachWizardStep } from './education'
import type { CoachTip } from './coachTipsTypes'
import type { CadenceHint } from './cadences/types'

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
    body: 'Use the Harmony strip on the roll for phrase chords (C, G7, or I / V7). Lock roots here if you prefer; qualities stay on the strip.',
  }
}

/** Phase-aware one-liner for the Tag Studio coach dock. */
export function tipForCoachUi(opts: {
  mode: CoachUiMode
  phase: CoachUiPhase
  hasMelody: boolean
  hasPillars: boolean
  wizardStep?: WizardStep
  /** When the focus moment implies a classic cadence, prefer that teach tip. */
  cadenceHint?: CadenceHint | null
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
      body: 'Check issues and polish — watch cadence misses (e.g. I under ^5→^1). Switch to Arrange for ranked chord suggestions under locked pillars.',
    }
  }
  if (opts.phase === 'pillars' || !opts.hasPillars) {
    return {
      step: 'step1_roots',
      title: 'Mark phrase chords',
      body: 'Pillars are the big structural chords under phrases (C, G7 — not every passing color). Lock the root of each; fill maj/7/m on the Chords step.',
    }
  }
  if (opts.cadenceHint) {
    return {
      step: opts.wizardStep ?? 'step5_smn_scf',
      title: `Cadence: ${opts.cadenceHint.label}`,
      body: opts.cadenceHint.teach,
      lessonId: 'L-classic-cadences',
      glossaryIds: [...opts.cadenceHint.glossaryIds],
    }
  }
  if (opts.wizardStep) return tipForStep(opts.wizardStep)
  return {
    step: 'step3_pmn_pcf',
    title: 'Choose chords',
    body: 'Follow the path (pillars → roles → chords) or jump tabs freely. Prefer classic cadences (V7→I, II7→V7→I, I7→IV). Hear suggestions and Apply one moment at a time.',
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
  return steps.map(tipForStep)
}
