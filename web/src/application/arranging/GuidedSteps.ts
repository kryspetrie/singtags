/**
 * Coach workflow steps — Chords → Check → Polish, with a Home landing.
 * Pillars / Note roles live on the roll (Sketch / Toolbar Roles), not in Coach.
 */
import type { CoachFocusTab } from '../../domain/arranging/nextCoachAction'
import type { ArrangementProject, WizardStep } from '../../domain/arranging/types'
import type { CoachUiMode } from '../../domain/arranging/coachTips'
import {
  detectCoachEntryMode,
  knownStackCoverage,
  type CoachEntryMode,
} from '../../domain/arranging/coachEntryMode'

export type GuidedStepId = 'home' | 'chords' | 'check' | 'polish'

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
    id: 'home',
    label: 'Home',
    tip: 'Coach walks the chart after melody and Sketch exist - then Chords > Check > Polish.',
    buttonTip:
      'Orient here, then open Chords. Lock phrase homes in Sketch first; Coach ranks under that map while the roll bar drives the walk.',
    glossaryIds: ['homophony', 'pillar', 'classic_cadences'],
    wizardSteps: ['melody', 'step1_roots', 'step2_confirm'],
  },
  {
    id: 'chords',
    label: 'Chords',
    tip: 'Hold to hear, ✓ to apply — one moment at a time. Prefer classic cadences when the Lead supports them.',
    buttonTip:
      'Select moments with ← → or the Coach lane. Preview stays audible while the playhead stays free. Next empty jumps gaps; Why? explains ranking.',
    glossaryIds: ['bs7', 'pcf', 'scf', 'classic_cadences'],
    wizardSteps: ['step3_pmn_pcf', 'step4_smn_pcf', 'step5_smn_scf', 'step6_alts'],
  },
  {
    id: 'check',
    label: 'Check',
    tip: 'Clear potential issues - cadence misses, spacing, motion - then polish.',
    buttonTip:
      'Open Check on the step rail, or Potential issues under Chords. Fix what you understand; Learn opens the teaching note for a rule.',
    glossaryIds: ['lock_ring', 'homophony', 'classic_cadences'],
    wizardSteps: ['step7_variety', 'step9_final'],
  },
  {
    id: 'polish',
    label: 'Polish',
    tip: 'Path-optimize inversions, strengthen approaches, then export.',
    buttonTip:
      'Treat the chart as one voice-leading path. Strengthen safely, skim the checklist, export MIDI/MusicXML when ready.',
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

/** Normalize prefs / legacy ids to a current rail step. */
export function normalizeGuidedStepId(raw: unknown): GuidedStepId | null {
  if (raw === 'home' || raw === 'chords' || raw === 'check' || raw === 'polish') return raw
  // Former Coach pages — send users to Home / Chords instead.
  if (raw === 'pillars' || raw === 'roles') return 'home'
  return null
}

export function resolveGuidedStep(
  project: ArrangementProject | null,
  opts: ResolveGuidedOpts = {},
): GuidedStepId {
  if (!project?.melody.length) return 'home'

  const entry = opts.entryMode ?? detectCoachEntryMode(project, opts.momentsLen)
  const coverage = knownStackCoverage(project, opts.momentsLen)

  if (entry === 'repair') {
    if (coverage < 0.5) return 'chords'
    if ((opts.errorCount ?? 0) === 0 && coverage >= 0.85) return 'polish'
    return 'check'
  }

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
  if (id === 'home') return 'home'
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
