/**
 * Form-preservation checks for key-change / embellishment plants.
 * @see knowledge/08 · F5–F6 phrase balance
 */

export type FormImpactInput = {
  beforeMeasureCount: number
  afterMeasureCount: number
  beforeTickLength: number
  afterTickLength: number
}

export type FormImpactResult = {
  ok: boolean
  warnings: string[]
}

/** Warn when a key-change plant alters measure count or total ticks. */
export function assessKeyChangeFormImpact(input: FormImpactInput): FormImpactResult {
  const warnings: string[] = []
  if (input.afterMeasureCount !== input.beforeMeasureCount) {
    warnings.push(
      `Measure count changed (${input.beforeMeasureCount} → ${input.afterMeasureCount}) — key-change plants should preserve form balance.`,
    )
  }
  if (input.afterTickLength !== input.beforeTickLength) {
    warnings.push(
      `Phrase length changed (${input.beforeTickLength} → ${input.afterTickLength} ticks) — do not cut or add beats of the source song.`,
    )
  }
  return { ok: warnings.length === 0, warnings }
}
