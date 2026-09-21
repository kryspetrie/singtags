/**
 * Guided Coach 4-step rail (maps to wizard steps under the hood).
 */
import type { CoachFocusTab } from '../../domain/arranging/nextCoachAction'
import type { ArrangementProject, WizardStep } from '../../domain/arranging/types'

export type GuidedStepId = 'pillars' | 'roles' | 'chords' | 'review'

export type GuidedStepDef = {
  id: GuidedStepId
  label: string
  tip: string
  /** Wizard steps this rail step covers. */
  wizardSteps: WizardStep[]
}

export const GUIDED_STEPS: readonly GuidedStepDef[] = [
  {
    id: 'pillars',
    label: 'Pillars',
    tip: 'Suggest and lock home chords (pillars) under the melody.',
    wizardSteps: ['melody', 'step1_roots', 'step2_confirm'],
  },
  {
    id: 'roles',
    label: 'Roles',
    tip: 'Label PMN vs SMN so home-family chords fit strong notes and passing color fits neighbors.',
    wizardSteps: ['step3_pmn_pcf', 'step4_smn_pcf'],
  },
  {
    id: 'chords',
    label: 'Chords',
    tip: 'Walk moments: PCF on PMN, SCF/passing on SMN. Prefer Apply over bulk fill.',
    wizardSteps: ['step5_smn_scf', 'step6_alts'],
  },
  {
    id: 'review',
    label: 'Review',
    tip: 'Clear blockers, then polish. Issues and export live here.',
    wizardSteps: ['step7_variety', 'step8_voicing', 'step9_final', 'done'],
  },
]

export function guidedStepIndex(id: GuidedStepId): number {
  return GUIDED_STEPS.findIndex((s) => s.id === id)
}

export function resolveGuidedStep(project: ArrangementProject | null): GuidedStepId {
  if (!project?.melody.length) return 'pillars'
  const pillars = project.pillars
  if (!pillars.length || pillars.some((p) => !p.confirmed)) return 'pillars'
  const unlabeled = project.melody.some((m) => m.role === 'unknown')
  if (unlabeled) return 'roles'
  const momentsFilled = project.stacks.length >= Math.max(1, Math.ceil(project.melody.length * 0.5))
  const errors = 0 // caller may override via opts
  if (!momentsFilled) return 'chords'
  void errors
  return 'review'
}

export function resolveGuidedStepWithLints(
  project: ArrangementProject | null,
  errorCount: number,
): GuidedStepId {
  const base = resolveGuidedStep(project)
  if (base === 'review') return 'review'
  if (base === 'chords' && errorCount > 0 && project?.stacks.length) return 'review'
  return base
}

export function tipForGuidedStep(id: GuidedStepId): string {
  return GUIDED_STEPS.find((s) => s.id === id)?.tip ?? ''
}

export function focusTabForGuidedStep(id: GuidedStepId): CoachFocusTab {
  if (id === 'pillars' || id === 'roles') return 'now'
  if (id === 'chords') return 'choose'
  return 'check'
}

export function wizardStepForGuided(id: GuidedStepId): WizardStep {
  const def = GUIDED_STEPS.find((s) => s.id === id)!
  return def.wizardSteps[def.wizardSteps.length - 1]!
}
