/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { STACK_RING_PRIORS } from './stackRingPriors.generated'
import { blendRingDisplay, stackRingKey, stackRingPrior } from './stackRingScore'

describe('stackRingScore', () => {
  it('has measured priors for catalog stacks', () => {
    expect(STACK_RING_PRIORS['seventh:5371']).toBeGreaterThan(STACK_RING_PRIORS['seventh:5713']!)
    expect(STACK_RING_PRIORS['minor:1531']).toBeGreaterThan(STACK_RING_PRIORS['minor:3155']!)
  })

  it('falls back to RING_TIER for unknown voicings', () => {
    expect(stackRingPrior('major', '9999')).toBeCloseTo(1, 5) // tier 1 → (7-1)/6
    expect(stackRingPrior('aug', '9999')).toBeCloseTo(1 / 6, 5)
  })

  it('blends display toward measured prior', () => {
    const key = stackRingKey('seventh', '5371')
    const prior = STACK_RING_PRIORS[key]!
    const blended = blendRingDisplay({
      harmonicityDisplay: 0.2,
      natureId: 'seventh',
      voicing: '5371',
      priorWeight: 0.5,
    })
    expect(blended).toBeCloseTo(0.5 * 0.2 + 0.5 * prior, 5)
  })
})
