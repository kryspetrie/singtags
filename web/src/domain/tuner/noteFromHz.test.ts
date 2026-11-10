import { describe, expect, it } from 'vitest'
import { noteFromHz } from './noteFromHz'

describe('noteFromHz', () => {
  it('maps A440 to A4 at 0¢', () => {
    const n = noteFromHz(440, 440)
    expect(n?.name).toBe('A4')
    expect(n?.cents).toBeCloseTo(0, 5)
  })

  it('reports sharp/flat cents', () => {
    const sharp = noteFromHz(440 * 2 ** (10 / 1200), 440)
    expect(sharp?.name).toBe('A4')
    expect(sharp?.cents).toBeCloseTo(10, 1)
  })
})
