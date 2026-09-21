import { describe, expect, it } from 'vitest'
import { majorScalePitchClasses, midiInMajorScale, midiInScale } from './scaleHighlight'

describe('scaleHighlight', () => {
  it('C major contains white-key pitch classes', () => {
    const pcs = majorScalePitchClasses(0)
    expect([...pcs].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11])
    expect(midiInMajorScale(60, 0)).toBe(true) // C4
    expect(midiInMajorScale(61, 0)).toBe(false) // C#4
  })

  it('G major (tonality 7) includes F#', () => {
    expect(midiInMajorScale(66, 7)).toBe(true) // F#
    expect(midiInMajorScale(65, 7)).toBe(false) // F natural
  })

  it('A natural minor includes C and G, not F#', () => {
    expect(midiInScale(60, 9, 'minor')).toBe(true) // C
    expect(midiInScale(67, 9, 'minor')).toBe(true) // G
    expect(midiInScale(66, 9, 'minor')).toBe(false) // F#
  })
})
