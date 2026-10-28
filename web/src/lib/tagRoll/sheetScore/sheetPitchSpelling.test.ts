import { describe, expect, it } from 'vitest'
import { createEmptyTagRollProject } from '../normalize'
import {
  chordSpellContextAtTick,
  spellChordRoot,
  spellMidiFromChord,
  spelledPitchToVexKey,
  spellWrittenMidi,
} from './sheetPitchSpelling'

describe('sheetPitchSpelling', () => {
  it('spells E7 third as G# (not Ab)', () => {
    // MIDI pc 8 = G#/Ab; E7 uses G#
    const p = spellMidiFromChord(68, { rootPc: 4, quality: 'seventh' }, true)
    expect(p.step).toBe('G')
    expect(p.alter).toBe(1)
    expect(spelledPitchToVexKey(p)).toBe('g#/4')
  })

  it('spells Ab7 root as Ab (not G#)', () => {
    const p = spellMidiFromChord(68, { rootPc: 8, quality: 'seventh' }, true)
    expect(p.step).toBe('A')
    expect(p.alter).toBe(-1)
    expect(spelledPitchToVexKey(p)).toBe('ab/4')
  })

  it('spells Ab7 seventh as Gb when key bias forces Ab root', () => {
    // In C, pc 8 is ♭VI → Ab even if preferFlats is false; 7th is Gb.
    const p = spellMidiFromChord(66, { rootPc: 8, quality: 'seventh' }, false, {
      tonality: 0,
      tonalityMode: 'major',
    })
    expect(p.step).toBe('G')
    expect(p.alter).toBe(-1)
  })

  it('spells Cdim7 seventh as Bbb (letter B, not A)', () => {
    // C + 9 = pc 9 = A/Bbb; dim7 role 7 → Bbb
    const p = spellMidiFromChord(69, { rootPc: 0, quality: 'dim7' }, true)
    expect(p.step).toBe('B')
    expect(p.alter).toBe(-2)
  })

  it('falls back to preferFlats for non-chord tones', () => {
    // F# is not in C major triad
    const sharp = spellMidiFromChord(66, { rootPc: 0, quality: 'major' }, false)
    expect(sharp.step).toBe('F')
    expect(sharp.alter).toBe(1)
    const flat = spellMidiFromChord(66, { rootPc: 0, quality: 'major' }, true)
    expect(flat.step).toBe('G')
    expect(flat.alter).toBe(-1)
  })

  it('uses key bias so ♭VI root is Ab even when preferFlats is false', () => {
    const root = spellChordRoot(8, false, 0, 'major')
    expect(root.step).toBe('A')
    expect(root.alter).toBe(-1)
  })

  it('prefers locked sketch over detected for context', () => {
    const p = createEmptyTagRollProject()
    p.preferFlats = false
    p.harmonySketch = [
      {
        id: 's1',
        startTick: 0,
        endTick: 480,
        rootPc: 8,
        quality: 'seventh',
        source: 'user',
        locked: true,
      },
    ]
    const ctx = chordSpellContextAtTick(p, 0, [
      { id: 'd1', startTick: 0, endTick: 480, rootPc: 4, quality: 'seventh' },
    ])
    expect(ctx).toEqual({ rootPc: 8, quality: 'seventh' })
    const spelled = spellWrittenMidi(68, p, 0, [
      { id: 'd1', startTick: 0, endTick: 480, rootPc: 4, quality: 'seventh' },
    ])
    expect(spelledPitchToVexKey(spelled)).toBe('ab/4')
  })

  it('uses detected quality when sketch is empty', () => {
    const p = createEmptyTagRollProject()
    p.preferFlats = true
    const spelled = spellWrittenMidi(68, p, 0, [
      { id: 'd1', startTick: 0, endTick: 480, rootPc: 4, quality: 'seventh' },
    ])
    expect(spelledPitchToVexKey(spelled)).toBe('g#/4')
  })
})
