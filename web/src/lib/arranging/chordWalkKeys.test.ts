/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { matchChordWalkKey } from './chordWalkKeys'

const base = {
  chordWalkActive: true,
  typingTarget: false,
  rolesAssignActive: false,
  shiftKey: false,
}

describe('matchChordWalkKey', () => {
  it('maps arrows and F/H/Q', () => {
    expect(matchChordWalkKey({ ...base, key: 'ArrowLeft' })).toBe('prevMoment')
    expect(matchChordWalkKey({ ...base, key: 'ArrowRight' })).toBe('nextMoment')
    expect(matchChordWalkKey({ ...base, key: 'ArrowUp' })).toBe('prevSuggest')
    expect(matchChordWalkKey({ ...base, key: 'ArrowDown' })).toBe('nextSuggest')
    expect(matchChordWalkKey({ ...base, key: 'f' })).toBe('apply')
    expect(matchChordWalkKey({ ...base, key: 'F' })).toBe('apply')
    expect(matchChordWalkKey({ ...base, key: 'h' })).toBe('hear')
    expect(matchChordWalkKey({ ...base, key: 'q' })).toBe('nextEmpty')
  })

  it('ignores typing, inactive, shift, and roles-assign for letters', () => {
    expect(matchChordWalkKey({ ...base, chordWalkActive: false, key: 'f' })).toBeNull()
    expect(matchChordWalkKey({ ...base, typingTarget: true, key: 'ArrowLeft' })).toBeNull()
    expect(matchChordWalkKey({ ...base, shiftKey: true, key: 'ArrowUp' })).toBeNull()
    expect(matchChordWalkKey({ ...base, rolesAssignActive: true, key: 'f' })).toBeNull()
    // Arrows still work during roles assign (no letter conflict).
    expect(matchChordWalkKey({ ...base, rolesAssignActive: true, key: 'ArrowLeft' })).toBe(
      'prevMoment',
    )
  })
})
