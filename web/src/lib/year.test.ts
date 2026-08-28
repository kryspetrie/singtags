import { describe, expect, it } from 'vitest'
import { normalizeYear } from './year'

describe('normalizeYear', () => {
  it('keeps plain years', () => {
    expect(normalizeYear(2013)).toBe(2013)
    expect(normalizeYear('2013')).toBe(2013)
  })

  it('extracts year from date-posted strings', () => {
    expect(normalizeYear('Wed, 13 Dec 2023')).toBe(2023)
    expect(normalizeYear('Sat, 4 Apr 2009')).toBe(2009)
    expect(normalizeYear('Tue, 7 Feb 2023')).toBe(2023)
  })

  it('rejects empty / garbage', () => {
    expect(normalizeYear(null)).toBeNull()
    expect(normalizeYear('')).toBeNull()
    expect(normalizeYear('unknown')).toBeNull()
    expect(normalizeYear(999)).toBeNull()
  })
})
