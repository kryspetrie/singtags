/**
 * Application-facing coach explanation DTO (UI renders only).
 */
import type { ArrangementLint } from '../../domain/arranging/qa/types'
import type { HarmonizeCandidate, UnscoredCandidate } from '../../domain/arranging/harmonize/types'
import type { RankerDeps } from '../../domain/arranging/harmonize'
import {
  teachAfterFix,
  teachCandidate,
  teachLint,
  teachWizardStep,
  type TeachableMoment,
} from '../../domain/arranging/education'

export type CoachExplanationDto = TeachableMoment

export function explanationForWizardStep(step: string): CoachExplanationDto | null {
  return teachWizardStep(step)
}

export function explanationForLint(lint: ArrangementLint): CoachExplanationDto {
  return teachLint(lint.ruleId, lint.message)
}

export function explanationForCandidate(
  candidate: HarmonizeCandidate,
  opts?: { unscored?: UnscoredCandidate; rankerDeps?: RankerDeps },
): CoachExplanationDto {
  return teachCandidate(candidate, opts)
}

export function explanationAfterFix(ruleId: string): { title: string; body: string } {
  return teachAfterFix(ruleId)
}
