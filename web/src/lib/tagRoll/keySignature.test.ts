import { describe, expect, it } from 'vitest'
import {
  KEY_CHOICES,
  keyChoiceById,
  keyChoiceId,
  majorKeyChoiceById,
  midiPitchLabel,
  vexKeySpec,
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

  it('maps minor keys to relative VexFlow specs', () => {
    expect(vexKeySpec(9, false, 'minor')).toBe('Am')
    expect(vexKeySpec(4, false, 'minor')).toBe('Em')
    expect(vexKeySpec(0, true, 'minor')).toBe('Cm')
    expect(keyChoiceId(2, true, 'minor')).toBe('Dm')
  })

  it('lists major and minor choices', () => {
    expect(KEY_CHOICES.some((k) => k.mode === 'major')).toBe(true)
    expect(KEY_CHOICES.some((k) => k.mode === 'minor')).toBe(true)
    expect(keyChoiceById('Am')?.mode).toBe('minor')
    expect(keyChoiceById('Eb')?.mode).toBe('major')
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
