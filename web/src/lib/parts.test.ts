import { describe, expect, it } from 'vitest'
import { partLabel, partTrackLabel, preferredDefaultPart, sortPartIds } from './parts'

describe('parts helpers', () => {
  it('orders primary parts then extras', () => {
    expect(sortPartIds(['bass', 'other2', 'mix', 'lead', 'other1'])).toEqual([
      'mix',
      'lead',
      'bass',
      'other1',
      'other2',
    ])
  })

  it('labels known and extra parts', () => {
    expect(partLabel('tenor')).toBe('Tenor')
    expect(partLabel('other1')).toBe('Other 1')
    expect(partTrackLabel('duet')).toBe('Duet Track')
    expect(partTrackLabel('mix')).toBe('Mix Track')
  })

  it('picks a sensible default part', () => {
    expect(preferredDefaultPart(['mix'])).toBe('mix')
    expect(preferredDefaultPart(['mix', 'bass', 'lead'])).toBe('mix')
    expect(preferredDefaultPart(['bass', 'lead'])).toBe('lead')
    expect(preferredDefaultPart(['other1', 'other2'])).toBe('other1')
    expect(preferredDefaultPart([])).toBeNull()
  })
})
