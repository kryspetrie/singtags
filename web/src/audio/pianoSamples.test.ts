/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import {
  leethringStemForMidi,
  midiToNote,
  noteToMidi,
  pianoSampleUrl,
} from './pianoSamples'

describe('pianoSamples map', () => {
  it('round-trips C4 and accidentals', () => {
    expect(noteToMidi('C4')).toBe(60)
    expect(midiToNote(60)).toBe('C4')
    expect(noteToMidi('C#4')).toBe(61)
    expect(noteToMidi('Db4')).toBe(61)
    expect(midiToNote(61)).toBe('C#4')
  })

  it('maps Leethring stems for key reference notes', () => {
    expect(leethringStemForMidi(21)).toBe('A_2') // A0
    expect(leethringStemForMidi(22)).toBe('A_2s')
    expect(leethringStemForMidi(23)).toBe('B_2')
    expect(leethringStemForMidi(24)).toBe('C_1')
    expect(leethringStemForMidi(36)).toBe('C') // C2
    expect(leethringStemForMidi(37)).toBe('Cs')
    expect(leethringStemForMidi(48)).toBe('cc') // C3
    expect(leethringStemForMidi(60)).toBe('c1') // C4
    expect(leethringStemForMidi(61)).toBe('c1s')
    expect(leethringStemForMidi(72)).toBe('c2') // C5
    expect(leethringStemForMidi(89)).toBe('f3') // F6
    expect(leethringStemForMidi(101)).toBe('f4') // F7
    expect(leethringStemForMidi(108)).toBe('c5') // C8
  })

  it('builds app-static sample URLs', () => {
    expect(pianoSampleUrl(60)).toMatch(/instruments\/piano\/m60\.opus$/)
  })
})
