/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { seedHasUserSketch } from './seedRefreshGuard'

describe('seedHasUserSketch', () => {
  it('is false for empty / detect-only maps', () => {
    expect(seedHasUserSketch(null)).toBe(false)
    expect(seedHasUserSketch([])).toBe(false)
    expect(
      seedHasUserSketch([{ locked: false, source: 'detect' }]),
    ).toBe(false)
  })

  it('is true when the user locked Declared / coach sketch', () => {
    expect(
      seedHasUserSketch([{ locked: true, source: 'user' }]),
    ).toBe(true)
    expect(
      seedHasUserSketch([{ locked: true, source: 'coach' }]),
    ).toBe(true)
  })
})
