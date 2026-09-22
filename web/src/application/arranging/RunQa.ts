import {
  createArrangementLinter,
  lintRulesForQaConfig,
  type ArrangementLint,
  type LintRule,
} from '../../domain/arranging/qa'
import { checkLeadRangeEnabled } from '../../domain/arranging/coachConfig'
import type { ArrangementProject } from '../../domain/arranging/types'

export function runQa(
  project: ArrangementProject,
  opts?: { rules?: readonly LintRule[]; checkLeadRange?: boolean },
): ArrangementLint[] {
  const rules = opts?.rules ?? lintRulesForQaConfig(project.qaConfig)
  const linter = createArrangementLinter(rules)
  return linter.lint(project, {
    profile: project.contestProfile,
    checkLeadRange: opts?.checkLeadRange ?? checkLeadRangeEnabled(project.qaConfig),
  })
}

export function lintSummary(lints: readonly ArrangementLint[]): {
  errors: number
  warns: number
  infos: number
} {
  return {
    errors: lints.filter((l) => l.severity === 'error').length,
    warns: lints.filter((l) => l.severity === 'warn').length,
    infos: lints.filter((l) => l.severity === 'info').length,
  }
}
