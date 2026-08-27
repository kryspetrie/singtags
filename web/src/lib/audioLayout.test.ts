import { describe, expect, it } from 'vitest'
import {
  hasKnownSoloSide,
  soloSideForPart,
  supportsCustomSoloMix,
} from './audioLayout'

describe('supportsCustomSoloMix', () => {
  it('allows legacy tags with no summary', () => {
    expect(supportsCustomSoloMix(undefined)).toBe(true)
    expect(supportsCustomSoloMix(null)).toBe(true)
  })

  it('allows part-predominant tags', () => {
    expect(supportsCustomSoloMix({ parts: 'part_left', ultra_low: 'mono_solos' })).toBe(true)
    expect(supportsCustomSoloMix({ parts: 'part_right', solo_side: 'right' })).toBe(true)
  })

  it('allows ultra-low mono stems for custom combine', () => {
    expect(supportsCustomSoloMix({ parts: 'mono', ultra_low: 'mono_downmix' })).toBe(true)
    expect(supportsCustomSoloMix({ parts: 'near_mono', ultra_low: 'mono_solos' })).toBe(true)
    expect(supportsCustomSoloMix({ parts: 'mixed', ultra_low: 'mono_downmix' })).toBe(true)
  })

  it('disables mono layout without ultra stem policy', () => {
    expect(supportsCustomSoloMix({ parts: 'mono' })).toBe(false)
    expect(supportsCustomSoloMix({ parts: 'near_mono' })).toBe(false)
  })
})

describe('soloSideForPart', () => {
  it('prefers per-part solo_side', () => {
    expect(
      soloSideForPart(
        'lead',
        { lead: { kind: 'part_right', solo_side: 'right' } },
        { parts: 'part_left', solo_side: 'left' },
      ),
    ).toBe('right')
  })

  it('falls back to summary', () => {
    expect(soloSideForPart('bari', {}, { parts: 'part_left', solo_side: 'left' })).toBe('left')
    expect(soloSideForPart('bass', undefined, { parts: 'part_right' })).toBe('right')
  })

  it('returns null when unknown', () => {
    expect(soloSideForPart('lead', undefined, undefined)).toBeNull()
    expect(hasKnownSoloSide('lead', undefined, { parts: 'mono' })).toBe(false)
  })
})
