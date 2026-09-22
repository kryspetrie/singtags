/**
 * Coach session preferences: contest ruleset, temperament, and which QA groups run.
 * Keep free of qa/ imports to avoid cycles with ArrangementProject.
 */

export type QaCheckGroupId =
  | 'vocabulary'
  | 'leadAndKey'
  | 'voicing'
  | 'density'
  | 'motion'
  | 'reminders'

export type ArrangementQaConfig = {
  /** Check groups the arranger has turned off (all groups on when empty). */
  disabledGroups: QaCheckGroupId[]
}

export const DEFAULT_QA_CONFIG: ArrangementQaConfig = {
  disabledGroups: [],
}

export type QaCheckGroupDef = {
  id: QaCheckGroupId
  label: string
  hint: string
  /** LintRule.id values in this group (emitter parents). */
  ruleIds: readonly string[]
}

/** Toggleable QA groups — structural rules (melody/pillars/orphans) always run. */
export const QA_CHECK_GROUPS: readonly QaCheckGroupDef[] = [
  {
    id: 'vocabulary',
    label: 'Contest vocabulary',
    hint: 'Illegal natures, aug / dim usage limits',
    ruleIds: ['illegal-nature', 'unrecognized-nature', 'aug-usage', 'dim-sustain'],
  },
  {
    id: 'leadAndKey',
    label: 'Lead range & key',
    hint: 'Singable lead tessitura and key suggestions',
    ruleIds: ['lead-range', 'key-suggestion'],
  },
  {
    id: 'voicing',
    label: 'Voicing integrity',
    hint: 'Complete triads, thin 9ths, doubled 3rds, spacing',
    ruleIds: ['voicing-integrity', 'strong-voicing', 'doubled-third', 'theory-spacing'],
  },
  {
    id: 'density',
    label: 'Lock & density',
    hint: 'Seventh density, homophony, dull harmonicity',
    ruleIds: [
      'few-sevenths',
      'bs7-density',
      'bs7-density-duration',
      'homophony-density',
      'dull-harmonicity',
    ],
  },
  {
    id: 'motion',
    label: 'Motion & color',
    hint: 'Voice leading, harmonic motion, swipes, flicker',
    ruleIds: [
      'voice-leading',
      'harmonic-motion',
      'theory-tension',
      'dim7-chain',
      'counterpart-flicker',
      'swipe-opportunity',
    ],
  },
  {
    id: 'reminders',
    label: 'Reminders',
    hint: 'Phrase length, song eligibility, copyright',
    ruleIds: ['phrase-length', 'song-eligibility', 'copyright-reminder'],
  },
]

export const ALWAYS_ON_LINT_RULE_IDS = new Set([
  'no-melody',
  'pillars',
  'orphan-stack',
  'missing-pillar',
])

export function normalizeQaConfig(
  raw: Partial<ArrangementQaConfig> | null | undefined,
): ArrangementQaConfig {
  const allowed = new Set(QA_CHECK_GROUPS.map((g) => g.id))
  const disabled = (raw?.disabledGroups ?? []).filter((id): id is QaCheckGroupId =>
    allowed.has(id as QaCheckGroupId),
  )
  return { disabledGroups: [...new Set(disabled)] }
}

export function isQaGroupEnabled(
  config: ArrangementQaConfig | null | undefined,
  groupId: QaCheckGroupId,
): boolean {
  const disabled = new Set(normalizeQaConfig(config).disabledGroups)
  return !disabled.has(groupId)
}

export function toggleQaGroup(
  config: ArrangementQaConfig | null | undefined,
  groupId: QaCheckGroupId,
  enabled: boolean,
): ArrangementQaConfig {
  const cur = new Set(normalizeQaConfig(config).disabledGroups)
  if (enabled) cur.delete(groupId)
  else cur.add(groupId)
  return { disabledGroups: [...cur] }
}

export function disabledLintRuleIds(
  config: ArrangementQaConfig | null | undefined,
): Set<string> {
  const disabled = new Set(normalizeQaConfig(config).disabledGroups)
  const out = new Set<string>()
  for (const g of QA_CHECK_GROUPS) {
    if (!disabled.has(g.id)) continue
    for (const id of g.ruleIds) out.add(id)
  }
  return out
}

export function checkLeadRangeEnabled(
  config: ArrangementQaConfig | null | undefined,
): boolean {
  return isQaGroupEnabled(config, 'leadAndKey')
}
