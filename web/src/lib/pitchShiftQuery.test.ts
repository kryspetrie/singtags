import { describe, expect, it } from 'vitest'
import { readPitchShiftFromQuery } from './pitchShiftQuery'

describe('readPitchShiftFromQuery', () => {
  it('reads and clamps shift', () => {
    expect(readPitchShiftFromQuery({})).toBe(0)
    expect(readPitchShiftFromQuery({ shift: '2' })).toBe(2)
    expect(readPitchShiftFromQuery({ shift: '99' })).toBe(12)
    expect(readPitchShiftFromQuery({ shift: 'nope' })).toBe(0)
  })
})
