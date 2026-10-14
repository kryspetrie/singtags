import type { ArrangementProject } from '../types'
import type { VoicingProfile } from '../voicingProfile'

export type LintSeverity = 'error' | 'warn' | 'info'

export type ArrangementLint = {
  id: string
  /** Stable rule key for fix registry (e.g. illegal-nature). */
  ruleId: string
  severity: LintSeverity
  message: string
  stackId?: string
  noteId?: string
  /** Glossary / lesson id for Learn panel. */
  teachingId?: string
  /** Optional structured payload for fix strategies. */
  data?: Record<string, unknown>
}

export type LintContext = {
  profile: ArrangementProject['contestProfile']
  checkLeadRange?: boolean
  /** When set, check stacks against ensemble Ranges strip bands. */
  voicingProfile?: VoicingProfile | null
}

export interface LintRule {
  readonly id: string
  check(project: ArrangementProject, ctx: LintContext): ArrangementLint[]
}
