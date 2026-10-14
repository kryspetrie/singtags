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
  it('maps suggest / voicing / spread / apply / hear / empty / Tab sketch walk', () => {
    expect(matchChordWalkKey({ ...base, key: 'ArrowLeft' })).toBeNull()
    expect(matchChordWalkKey({ ...base, key: 'ArrowRight' })).toBeNull()
    expect(matchChordWalkKey({ ...base, key: 'ArrowUp' })).toBe('prevSuggest')
    expect(matchChordWalkKey({ ...base, key: 'ArrowDown' })).toBe('nextSuggest')
    expect(matchChordWalkKey({ ...base, key: '[' })).toBe('prevVoicing')
    expect(matchChordWalkKey({ ...base, key: ']' })).toBe('nextVoicing')
    expect(matchChordWalkKey({ ...base, key: 'w' })).toBe('toggleSpread')
    expect(matchChordWalkKey({ ...base, key: 'W' })).toBe('toggleSpread')
    expect(matchChordWalkKey({ ...base, key: 'f' })).toBe('apply')
    expect(matchChordWalkKey({ ...base, key: 'F' })).toBe('apply')
    expect(matchChordWalkKey({ ...base, key: 'Enter' })).toBe('apply')
    expect(matchChordWalkKey({ ...base, key: 'Tab' })).toBe('applyNextSketch')
    expect(matchChordWalkKey({ ...base, key: 'Tab', shiftKey: true })).toBe('prevSketch')
    expect(matchChordWalkKey({ ...base, key: 'h' })).toBe('hear')
    expect(matchChordWalkKey({ ...base, key: 'q' })).toBe('nextEmpty')
  })

  it('ignores typing, inactive, shift (except Tab), and roles-assign for letters', () => {
    expect(matchChordWalkKey({ ...base, chordWalkActive: false, key: 'f' })).toBeNull()
    expect(matchChordWalkKey({ ...base, typingTarget: true, key: 'ArrowUp' })).toBeNull()
    expect(matchChordWalkKey({ ...base, typingTarget: true, key: 'Tab' })).toBeNull()
    expect(matchChordWalkKey({ ...base, shiftKey: true, key: 'ArrowUp' })).toBeNull()
    expect(matchChordWalkKey({ ...base, rolesAssignActive: true, key: 'f' })).toBeNull()
    expect(matchChordWalkKey({ ...base, rolesAssignActive: true, key: 'w' })).toBeNull()
    // Non-letter Chord Walk still works during roles assign.
    expect(matchChordWalkKey({ ...base, rolesAssignActive: true, key: 'ArrowDown' })).toBe(
      'nextSuggest',
    )
    expect(matchChordWalkKey({ ...base, rolesAssignActive: true, key: ']' })).toBe('nextVoicing')
    expect(matchChordWalkKey({ ...base, rolesAssignActive: true, key: 'Tab' })).toBe(
      'applyNextSketch',
    )
    expect(
      matchChordWalkKey({ ...base, rolesAssignActive: true, key: 'Tab', shiftKey: true }),
    ).toBe('prevSketch')
  })
})
