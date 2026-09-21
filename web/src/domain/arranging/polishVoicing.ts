/**
 * Step VIII — batch safe voicing polish (stable fix order).
 */
import type { ArrangementProject } from './types'
import { lintArrangement } from './qa/arrangementLinter'
import { createFixRegistry, type FixRegistry } from './qa/fixRegistry'
import type { FixContext } from './qa/fixes/illegalChordFix'

const POLISH_RULES = new Set([
  'voice-leading',
  'doubled-third',
  'incomplete-triad',
  'thin-ninth',
  'illegal-chord',
])

export function polishVoicings(
  project: ArrangementProject,
  opts: { registry?: FixRegistry; ctx?: FixContext } = {},
): { project: ArrangementProject; applied: string[] } {
  const registry = opts.registry ?? createFixRegistry()
  const lints = lintArrangement(project).filter((l) => POLISH_RULES.has(l.ruleId))
  return registry.applyAllSafe(project, lints, opts.ctx)
}
