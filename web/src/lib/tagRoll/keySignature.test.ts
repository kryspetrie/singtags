import { describe, expect, it } from 'vitest'
import {
  majorKeyChoiceById,
  midiPitchLabel,
  vexMajorKeySpec,
} from './keySignature'

describe('keySignature', () => {
  it('maps tonality + spelling to VexFlow specs', () => {
    expect(vexMajorKeySpec(0, false)).toBe('C')
    expect(vexMajorKeySpec(7, false)).toBe('G')
    expect(vexMajorKeySpec(10, true)).toBe('Bb')
    expect(vexMajorKeySpec(1, true)).toBe('Db')
    expect(vexMajorKeySpec(1, false)).toBe('C#')
  })

  it('resolves choice ids', () => {
    expect(majorKeyChoiceById('Eb')?.tonality).toBe(3)
    expect(majorKeyChoiceById('Eb')?.preferFlats).toBe(true)
    expect(majorKeyChoiceById('nope')).toBeNull()
  })

  it('labels midi with flats or sharps', () => {
    expect(midiPitchLabel(61, false)).toBe('C#4')
    expect(midiPitchLabel(61, true)).toBe('Db4')
  })
})
