import { describe, expect, it } from 'vitest'
import { formatDisplayCents, isInTuneCents } from './displayCents'

describe('displayCents', () => {
  it('uses integer cents when clarity is low', () => {
    expect(formatDisplayCents(12.4, { clarity: 0.5 })).toBe('+12¢')
    expect(formatDisplayCents(-3.6, { clarity: 0.2 })).toBe('-4¢')
  })

  it('uses 0.1¢ when clarity is high', () => {
    expect(formatDisplayCents(12.34, { clarity: 0.9 })).toBe('+12.3¢')
    // Math.round half-away-from-zero toward +∞: -0.05 → 0.0; use a clear tenth.
    expect(formatDisplayCents(-0.14, { clarity: 0.95 })).toBe('-0.1¢')
  })

  it('gates in-tune by absolute window', () => {
    expect(isInTuneCents(8, 10)).toBe(true)
    expect(isInTuneCents(-11, 10)).toBe(false)
  })
})
