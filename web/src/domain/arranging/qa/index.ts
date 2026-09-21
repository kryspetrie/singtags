export type {
  ArrangementLint,
  LintSeverity,
  LintContext,
  LintRule,
} from './types'
export { DEFAULT_LINT_RULES } from './lintRules'
export { createArrangementLinter, lintArrangement } from './arrangementLinter'
export { createFixRegistry } from './fixRegistry'
export type { FixRegistry } from './fixRegistry'
export {
  illegalChordFix,
  applyPatch,
  orphanStackFix,
  voiceLeadingFix,
  augPillarFix,
  fewSeventhsFix,
  thinNinthPreferFix,
  doubledThirdFix,
  dullHarmonicityFix,
} from './fixes/illegalChordFix'
export { keySuggestionFix, leadRangeFix } from './fixes/transposeFixes'
export { incompleteTriadFix } from './fixes/revoiceFix'
export type { FixStrategy, FixContext, ProjectPatch } from './fixes/illegalChordFix'
