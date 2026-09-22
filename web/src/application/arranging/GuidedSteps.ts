/**
 * Coach workflow steps — compose vs repair share the rail; routing differs.
 */
import type { CoachFocusTab } from '../../domain/arranging/nextCoachAction'
import type { ArrangementProject, WizardStep } from '../../domain/arranging/types'
import type { CoachUiMode } from '../../domain/arranging/coachTips'
import {
  detectCoachEntryMode,
  knownStackCoverage,
  type CoachEntryMode,
} from '../../domain/arranging/coachEntryMode'

export type GuidedStepId = 'pillars' | 'roles' | 'chords' | 'check' | 'polish'

export type GuidedStepDef = {
  id: GuidedStepId
  label: string
  /** Short tip under the rail. */
  tip: string
  /** Longer hover text on the step button (teaching-oriented). */
  buttonTip: string
  /** Glossary ids to surface in the active step’s teach strip. */
  glossaryIds: readonly string[]
  /** Wizard steps this rail step covers. */
  wizardSteps: WizardStep[]
}

export const GUIDED_STEPS: readonly GuidedStepDef[] = [
  {
    id: 'pillars',
    label: 'Pillars',
    tip: 'Suggest and lock home chords (pillars) under the melody.',
    buttonTip:
      'Pillars are the home roots under each phrase — what the harmony is “about,” not every passing chord. Suggest spans, set the root, Hear, then Lock.',
    glossaryIds: ['pillar', 'pcf'],
    wizardSteps: ['melody', 'step1_roots', 'step2_confirm'],
  },
  {
    id: 'roles',
    label: 'Strong / passing',
    tip: 'Mark Lead notes as strong home tones or passing connective tones so the coach picks chords accordingly.',
    buttonTip:
      'Strong notes are home tones that should sit on pillar-family chords. Passing notes are connective tones where color chords are more welcome later.',
    glossaryIds: ['pmn', 'smn', 'melody_pass'],
    wizardSteps: ['step3_pmn_pcf', 'step4_smn_pcf'],
  },
  {
    id: 'chords',
    label: 'Chords',
    tip: 'Walk moments: pick a ranked chord per note. Prefer Apply over bulk fill.',
    buttonTip:
      'At each moment, choose a ranked voicing for the Lead. Prefer Apply on one moment at a time so you hear and understand the choice. Open Why? to see which craft factors ranked a candidate.',
    glossaryIds: ['bs7', 'pcf', 'scf'],
    wizardSteps: ['step5_smn_scf', 'step6_alts'],
  },
  {
    id: 'check',
    label: 'Check',
    tip: 'Clear blockers in the selected range. Fix what you can, then polish.',
    buttonTip:
      'QA finds style and craft issues in the selected range. Fix what you understand; use Learn on an issue for the teaching note.',
    glossaryIds: ['lock_ring', 'homophony'],
    wizardSteps: ['step7_variety', 'step9_final'],
  },
  {
    id: 'polish',
    label: 'Polish',
    tip: 'Strengthen voicings, skim the checklist, and export when ready.',
    buttonTip:
      'Strengthen weak approaches, check voicing craft, then export. Polish is the last teaching pass before the chart leaves the coach.',
    glossaryIds: ['strong_voicing', 'secondary_dom'],
    wizardSteps: ['step8_voicing', 'done'],
  },
]

export type ResolveGuidedOpts = {
  momentsLen?: number
  entryMode?: CoachEntryMode
  errorCount?: number
}

export function guidedStepIndex(id: GuidedStepId): number {
  return GUIDED_STEPS.findIndex((s) => s.id === id)
}

export function resolveGuidedStep(
  project: ArrangementProject | null,
  opts: ResolveGuidedOpts = {},
): GuidedStepId {
  if (!project?.melody.length) return 'pillars'

  const entry = opts.entryMode ?? detectCoachEntryMode(project, opts.momentsLen)
  const pillars = project.pillars
  const coverage = knownStackCoverage(project, opts.momentsLen)

  if (!pillars.length || pillars.some((p) => !p.confirmed)) return 'pillars'

  if (entry === 'repair') {
    // Roles are optional in repair — jump to fill gaps or Check.
    if (coverage < 0.5) return 'chords'
    if ((opts.errorCount ?? 0) === 0 && coverage >= 0.85) return 'polish'
    return 'check'
  }

  const unlabeled = project.melody.some((m) => m.role === 'unknown')
  if (unlabeled) return 'roles'
  if (coverage < 0.5) return 'chords'
  if ((opts.errorCount ?? 0) === 0 && coverage >= 0.85) return 'polish'
  return 'check'
}

export function resolveGuidedStepWithLints(
  project: ArrangementProject | null,
  errorCount: number,
  opts: Omit<ResolveGuidedOpts, 'errorCount'> = {},
): GuidedStepId {
  return resolveGuidedStep(project, { ...opts, errorCount })
}

export function tipForGuidedStep(id: GuidedStepId): string {
  return GUIDED_STEPS.find((s) => s.id === id)?.tip ?? ''
}

export function glossaryIdsForGuidedStep(id: GuidedStepId): readonly string[] {
  return GUIDED_STEPS.find((s) => s.id === id)?.glossaryIds ?? []
}

export function buttonTipForGuidedStep(id: GuidedStepId): string {
  return GUIDED_STEPS.find((s) => s.id === id)?.buttonTip ?? tipForGuidedStep(id)
}

export function labelForGuidedStep(id: GuidedStepId): string {
  return GUIDED_STEPS.find((s) => s.id === id)?.label ?? id
}

export function focusTabForGuidedStep(id: GuidedStepId): CoachFocusTab {
  if (id === 'pillars' || id === 'roles') return 'now'
  if (id === 'chords') return 'choose'
  if (id === 'polish') return 'polish'
  return 'check'
}

export function modeForGuidedStep(id: GuidedStepId): CoachUiMode {
  return id === 'check' || id === 'polish' ? 'review' : 'arrange'
}

export function wizardStepForGuided(id: GuidedStepId): WizardStep {
  const def = GUIDED_STEPS.find((s) => s.id === id)!
  return def.wizardSteps[def.wizardSteps.length - 1]!
}
