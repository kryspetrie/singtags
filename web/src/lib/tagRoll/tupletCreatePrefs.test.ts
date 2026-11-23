/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  clampTupletCreateRatio,
  defaultTupletCreateRatio,
  formatTupletRatio,
  tupletCreatePresetKey,
} from './tupletCreatePrefs'

describe('tupletCreatePrefs', () => {
  it('defaults to triplet 3:2', () => {
    expect(defaultTupletCreateRatio()).toEqual({ actualNotes: 3, normalNotes: 2 })
  })

  it('clamps and rounds ratio fields', () => {
    expect(clampTupletCreateRatio({ actualNotes: 1.2, normalNotes: 99 })).toEqual({
      actualNotes: 2,
      normalNotes: 16,
    })
  })

  it('detects presets vs custom', () => {
    expect(tupletCreatePresetKey({ actualNotes: 3, normalNotes: 2 })).toBe('triplet')
    expect(tupletCreatePresetKey({ actualNotes: 7, normalNotes: 4 })).toBe('custom')
    expect(formatTupletRatio({ actualNotes: 7, normalNotes: 4 })).toBe('7:4')
  })
})
