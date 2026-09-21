import type { ArrangementProject } from '../types'
import type { ArrangementLint, LintContext, LintRule } from './types'
import { DEFAULT_LINT_RULES } from './lintRules'

export function createArrangementLinter(rules: readonly LintRule[] = DEFAULT_LINT_RULES) {
  return {
    lint(project: ArrangementProject, ctx: LintContext): ArrangementLint[] {
      if (project.melody.length === 0) {
        return rules
          .filter((r) => r.id === 'no-melody')
          .flatMap((r) => r.check(project, ctx))
      }
      const out: ArrangementLint[] = []
      for (const rule of rules) {
        if (rule.id === 'no-melody') continue
        out.push(...rule.check(project, ctx))
      }
      return out
    },
  }
}

export function lintArrangement(
  project: ArrangementProject,
  opts: {
    profile?: ArrangementProject['contestProfile']
    checkLeadRange?: boolean
  } = {},
): ArrangementLint[] {
  return createArrangementLinter().lint(project, {
    profile: opts.profile ?? project.contestProfile,
    checkLeadRange: opts.checkLeadRange,
  })
}
