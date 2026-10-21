/**
 * Stack-level ring heuristic from JI FFT analysis + RING_TIER fallback.
 * Secondary ranking driver and Coach strip Ring % blend.
 */
import { ringTier } from '../contestProfile'
import { STACK_RING_PRIORS } from './stackRingPriors.generated'

export function stackRingKey(natureId: string, voicing: string): string {
  return `${natureId}:${voicing.trim()}`
}

/**
 * Measured prior in [0,1] for a catalog stack (`nature:voicing`).
 * Unknown shells fall back to nature RING_TIER (tier 1 → ~0.83, tier 6 → 0).
 */
export function stackRingPrior(natureId: string, voicing: string): number {
  const hit = STACK_RING_PRIORS[stackRingKey(natureId, voicing)]
  if (hit != null && Number.isFinite(hit)) return Math.min(1, Math.max(0, hit))
  const t = ringTier(natureId)
  return Math.min(1, Math.max(0, (7 - t) / 6))
}

/**
 * Coach strip Ring %: blend analytical JI harmonicity display with measured stack prior.
 * Keeps empty/unknown voicings usable via RING_TIER fallback inside {@link stackRingPrior}.
 */
export function blendRingDisplay(opts: {
  harmonicityDisplay: number
  natureId: string
  voicing: string
  /** Weight on measured stack prior (rest on analytical display). Default 0.42. */
  priorWeight?: number
}): number {
  const w = opts.priorWeight ?? 0.42
  const prior = stackRingPrior(opts.natureId, opts.voicing)
  const h = Math.min(1, Math.max(0, opts.harmonicityDisplay))
  return Math.min(1, Math.max(0, (1 - w) * h + w * prior))
}
