import { describe, expect, it } from 'vitest'
import { COACH_MODE_CARDS, coachModeCard } from './coachModeCatalog'

describe('coachModeCatalog', () => {
  it('lists Arrange then Review', () => {
    expect(COACH_MODE_CARDS.map((c) => c.id)).toEqual(['arrange', 'review'])
  })

  it('resolves cards by id', () => {
    expect(coachModeCard('arrange').title).toBe('Arrange')
    expect(coachModeCard('review').defaultFocus).toBe('check')
  })
})
