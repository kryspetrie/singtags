/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  clampMidiToPart,
  defaultVoicingProfile,
  midiFitsPartBands,
  normalizeVoicingProfile,
  outerSpanOk,
  voicingProfileFromPreset,
  withCustomVoicingProfile,
} from './voicingProfile'

describe('voicingProfile', () => {
  it('TTBB preset clamps bass into band', () => {
    const p = voicingProfileFromPreset('ttbb')
    expect(clampMidiToPart('bass', 40, p)).toBeGreaterThanOrEqual(p.parts.bass.min)
    expect(clampMidiToPart('tenor', 90, p)).toBeLessThanOrEqual(p.parts.tenor.max)
  })

  it('SATB maps wider outer span than TTBB', () => {
    const ttbb = voicingProfileFromPreset('ttbb')
    const satb = voicingProfileFromPreset('satb')
    expect(satb.maxOuterSpan).toBeGreaterThan(ttbb.maxOuterSpan)
    expect(outerSpanOk({ bass: 48, bari: 55, lead: 60, tenor: 72 }, satb)).toBe(true)
  })

  it('editing bands marks custom', () => {
    const base = defaultVoicingProfile()
    const next = withCustomVoicingProfile(base, {
      parts: { ...base.parts, bass: { min: 42, max: 58 } },
    })
    expect(next.presetId).toBe('custom')
    expect(next.parts.bass.min).toBe(42)
  })

  it('normalize recovers missing prefs', () => {
    const n = normalizeVoicingProfile({ presetId: 'ssaa' })
    expect(n.presetId).toBe('ssaa')
    expect(n.parts.tenor.max).toBeGreaterThan(80)
  })

  it('midiFitsPartBands enforces bands and max outer span (Lead free)', () => {
    const p = voicingProfileFromPreset('ttbb')
    expect(
      midiFitsPartBands({ bass: 48, bari: 55, lead: 90, tenor: 67 }, p),
    ).toBe(true)
    expect(
      midiFitsPartBands({ bass: 36, bari: 55, lead: 60, tenor: 67 }, p),
    ).toBe(false)
    expect(
      midiFitsPartBands({ bass: 48, bari: 55, lead: 60, tenor: 80 }, p),
    ).toBe(false)
  })
})
