import type { ArrangementProject } from '../types'
import type { ArrangementLint } from './types'
import {
  applyPatch,
  illegalChordFix,
  orphanStackFix,
  voiceLeadingFix,
  augPillarFix,
  fewSeventhsFix,
  thinNinthPreferFix,
  doubledThirdFix,
  dullHarmonicityFix,
  type FixContext,
  type FixStrategy,
  type ProjectPatch,
} from './fixes/illegalChordFix'
import { keySuggestionFix, leadRangeFix } from './fixes/transposeFixes'
import { incompleteTriadFix } from './fixes/revoiceFix'

const DEFAULT_STRATEGIES: FixStrategy[] = [
  illegalChordFix,
  incompleteTriadFix,
  thinNinthPreferFix,
  doubledThirdFix,
  dullHarmonicityFix,
  orphanStackFix,
  voiceLeadingFix,
  augPillarFix,
  fewSeventhsFix,
  keySuggestionFix,
  leadRangeFix,
]

export function createFixRegistry(strategies: readonly FixStrategy[] = DEFAULT_STRATEGIES) {
  const byRule = new Map(strategies.map((s) => [s.ruleId, s]))
  return {
    find(lint: ArrangementLint): FixStrategy | undefined {
      return byRule.get(lint.ruleId)
    },
    canFix(lint: ArrangementLint, project: ArrangementProject): boolean {
      const s = byRule.get(lint.ruleId)
      return s?.canFix(lint, project) ?? false
    },
    apply(
      lint: ArrangementLint,
      project: ArrangementProject,
      ctx?: FixContext,
    ): ProjectPatch | null {
      const s = byRule.get(lint.ruleId)
      if (!s || !s.canFix(lint, project)) return null
      return s.apply(lint, project, ctx)
    },
    applyToProject(
      lint: ArrangementLint,
      project: ArrangementProject,
      ctx?: FixContext,
    ): ArrangementProject | null {
      const patch = this.apply(lint, project, ctx)
      if (!patch) return null
      return applyPatch(project, patch)
    },
    applyAllSafe(project: ArrangementProject, lints: readonly ArrangementLint[], ctx?: FixContext) {
      let current = project
      const applied: string[] = []
      for (const lint of lints) {
        if (lint.severity === 'info') continue
        // Skip destructive transpose in batch
        if (lint.ruleId === 'key-suggestion' || lint.ruleId === 'lead-range') continue
        const next = this.applyToProject(lint, current, ctx)
        if (next) {
          current = next
          applied.push(lint.id)
        }
      }
      return { project: current, applied }
    },
  }
}

export type FixRegistry = ReturnType<typeof createFixRegistry>
