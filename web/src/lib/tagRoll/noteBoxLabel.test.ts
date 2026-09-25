import { describe, expect, it } from 'vitest'
import { noteBoxPitchName } from './noteBoxLabel'

describe('noteBoxPitchName', () => {
  it('labels naturals without octave', () => {
    expect(noteBoxPitchName(60, false)).toBe('C')
    expect(noteBoxPitchName(62, false)).toBe('D')
    expect(noteBoxPitchName(67, false)).toBe('G')
  })

  it('honors flat vs sharp spelling', () => {
    expect(noteBoxPitchName(70, true)).toBe('Bb')
    expect(noteBoxPitchName(70, false)).toBe('A#')
    expect(noteBoxPitchName(61, true)).toBe('Db')
    expect(noteBoxPitchName(61, false)).toBe('C#')
  })
})
