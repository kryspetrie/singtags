/**
 * Domain helper tests for coach mode landing catalog.
 */
import { describe, expect, it } from 'vitest'
import { COACH_MODE_CARDS, coachModeCard } from './coachModeCatalog'

describe('coachModeCatalog', () => {
  it('lists Quick, Guided, Review with blurbs', () => {
    expect(COACH_MODE_CARDS.map((c) => c.id)).toEqual(['quick', 'guided', 'review'])
    for (const c of COACH_MODE_CARDS) {
      expect(c.body.length).toBeGreaterThan(40)
      expect(c.tagline.length).toBeGreaterThan(0)
    }
  })

  it('resolves cards by id', () => {
    expect(coachModeCard('guided').title).toBe('Guided')
    expect(coachModeCard('review').defaultFocus).toBe('check')
  })
})
