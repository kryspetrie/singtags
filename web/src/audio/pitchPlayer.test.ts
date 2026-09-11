/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import { CHROMATIC_NOTES, formatKeyShiftLabel, formatRelativePitchLabel, keyToTonicNote, noteToFrequency, aHzToCents, pitchPipeAriaLabel, pitchPipeDisplay, pitchPipeNotes, pitchPipeFullKeyboardNotes,
  normalizePitchPipeGridScale,
  normalizeSheetPianoKeyScale,
  sheetPianoWhiteKeyPx,
  pitchPipeCOctaveNotes,
  pitchPipePcKeyNoteMap,
  pitchPipePcKeyOctave,
  pitchPipePcKeyWindowNotes,
  pitchPipePianoSlots, toPitchGlyph, PITCH_PIPE_NOTES, PAY_KEY_MIN_NOTE, PAY_KEY_MAX_NOTE, PitchPlayer, transposeKeyLabel, clampPitchSemitones, MIN_PITCH_SEMITONES, MAX_PITCH_SEMITONES, KEY_SHIFT_LABEL_SIZE_SAMPLE } from './pitchPlayer'

describe('pitchPlayer helpers', () => {
  it('maps keys to tonic notes in E3–E4', () => {
    expect(keyToTonicNote('Major:Ab')).toBe('Ab3')
    expect(keyToTonicNote('G Major')).toBe('G3')
    expect(keyToTonicNote('C Major')).toBe('C4')
    expect(keyToTonicNote('F Major')).toBe('F3')
    expect(keyToTonicNote('Bb')).toBe('Bb3')
    expect(keyToTonicNote(null)).toBeNull()
    expect(keyToTonicNote('')).toBeNull()
  })

  it('clamps pitch shift to one octave', () => {
    expect(clampPitchSemitones(0)).toBe(0)
    expect(clampPitchSemitones(12)).toBe(12)
    expect(clampPitchSemitones(-12)).toBe(-12)
    expect(clampPitchSemitones(13)).toBe(MAX_PITCH_SEMITONES)
    expect(clampPitchSemitones(-20)).toBe(MIN_PITCH_SEMITONES)
    expect(clampPitchSemitones(1.6)).toBe(2)
  })

  it('formats key with semitone shift', () => {
    expect(formatKeyShiftLabel('Ab Major', 0)).toBe('Ab Major')
    expect(formatKeyShiftLabel('Ab Major', 2)).toBe('Ab Major +2 (Bb Major)')
    expect(formatKeyShiftLabel('C Major', -1)).toBe('C Major -1 (B Major)')
    expect(formatKeyShiftLabel('Major:Bb', 1)).toBe('Major:Bb +1 (Major:B)')
    expect(transposeKeyLabel('F# Major', 1)).toBe('G Major')
    expect(formatKeyShiftLabel(null, 0)).toBe('(Use +/- to choose key)')
    expect(formatKeyShiftLabel('', 0)).toBe('(Use +/- to choose key)')
    expect(formatKeyShiftLabel(null, 2)).toBe('D Major')
    expect(formatKeyShiftLabel(null, -1)).toBe('B Major')
  })

  it('formats relative pitch shifts without a song key', () => {
    expect(formatRelativePitchLabel(0)).toBe('Original')
    expect(formatRelativePitchLabel(1)).toBe('+1 semitone')
    expect(formatRelativePitchLabel(2)).toBe('+2 semitones')
    expect(formatRelativePitchLabel(-1)).toBe('-1 semitone')
    expect(formatRelativePitchLabel(-3)).toBe('-3 semitones')
  })

  it('KEY_SHIFT_LABEL_SIZE_SAMPLE is at least as wide as common pitch labels', () => {
    const samples = [
      formatKeyShiftLabel(null, 0),
      formatKeyShiftLabel('C# Minor', MAX_PITCH_SEMITONES),
      formatKeyShiftLabel('Ab Major', MIN_PITCH_SEMITONES),
      formatKeyShiftLabel('Major:G#', 12),
      formatKeyShiftLabel('Bb', 0),
    ]
    for (const s of samples) {
      expect(KEY_SHIFT_LABEL_SIZE_SAMPLE.length).toBeGreaterThanOrEqual(s.length)
    }
  })

  it('converts notes to frequency', () => {
    expect(noteToFrequency('A4')).toBeCloseTo(440, 5)
    expect(noteToFrequency('C4')).toBeCloseTo(261.63, 0)
  })

  it('converts concert A Hz to cents vs A440', () => {
    expect(aHzToCents(440)).toBe(0)
    expect(aHzToCents(432)).toBe(-32)
    expect(aHzToCents(444)).toBe(16)
  })

  it('exposes chromatic range', () => {
    expect(CHROMATIC_NOTES.length).toBeGreaterThan(20)
  })

  it('exposes chromatic pitch-pipe note grids', () => {
    expect(PITCH_PIPE_NOTES['f3-f4']).toHaveLength(13)
    expect(PITCH_PIPE_NOTES['e3-e4']).toHaveLength(13)
    expect(PITCH_PIPE_NOTES['c3-c4']).toHaveLength(13)
    expect(PITCH_PIPE_NOTES['c4-c5']).toHaveLength(13)
    expect(PITCH_PIPE_NOTES['f3-f4'][0]).toBe('F3')
    expect(PITCH_PIPE_NOTES['f3-f4'][12]).toBe('F4')
    expect(PITCH_PIPE_NOTES['e3-e4'][0]).toBe('E3')
    expect(PITCH_PIPE_NOTES['e3-e4'][12]).toBe('E4')
    expect(PITCH_PIPE_NOTES['c3-c4'][0]).toBe('C3')
    expect(PITCH_PIPE_NOTES['c3-c4'].at(-1)).toBe('C4')
    expect(PITCH_PIPE_NOTES['c4-c5'][0]).toBe('C4')
    expect(PITCH_PIPE_NOTES['c4-c5'].at(-1)).toBe('C5')
    expect(PITCH_PIPE_NOTES['f3-f4']).toContain('A#3')
    expect(PITCH_PIPE_NOTES['f3-f4']).toContain('C#4')
    expect(pitchPipeNotes('f3-f4')).toEqual([...PITCH_PIPE_NOTES['f3-f4']])
  })

  it('defines pay-the-key octave bounds', () => {
    expect(PAY_KEY_MIN_NOTE).toBe('E3')
    expect(PAY_KEY_MAX_NOTE).toBe('E4')
  })

  it('labels sharps with flat equivalents for pitch pipe', () => {
    expect(pitchPipeDisplay('C#3')).toEqual({
      note: 'C#3',
      sharp: 'C♯',
      flat: 'D♭',
      octave: '3',
      isBlack: true,
      pitchClass: 'C',
    })
    expect(pitchPipeDisplay('A#4')).toMatchObject({ flat: 'B♭', octave: '4', isBlack: true })
    expect(pitchPipeDisplay('Bb3')).toMatchObject({
      isBlack: true,
      sharp: 'A♯',
      flat: 'B♭',
      octave: '3',
    })
    expect(pitchPipeDisplay('E3')).toMatchObject({ isBlack: false, flat: null, sharp: 'E' })
    expect(pitchPipeAriaLabel('F#2')).toBe('Play F♯2 (G♭2)')
    expect(pitchPipeAriaLabel('G3')).toBe('Play G3')
  })

  it('formats accidentals with music glyphs', () => {
    expect(toPitchGlyph('C#')).toBe('C♯')
    expect(toPitchGlyph('Db')).toBe('D♭')
    expect(toPitchGlyph('A')).toBe('A')
  })

  it('builds vertical piano white/black slots', () => {
    const slots = pitchPipePianoSlots(pitchPipeNotes('f3-f4'))
    expect(slots.whites[0]).toBe('F3')
    expect(slots.whites.at(-1)).toBe('F4')
    expect(slots.blacks.some((b) => b.note === 'F#3' && b.after === 'F3')).toBe(true)
    expect(slots.blacks.some((b) => b.note === 'C#4' && b.after === 'C4')).toBe(true)
  })

  it('maps computer keys to a piano layout (E R / Y U I / [ ] over whites)', () => {
    const win = pitchPipePcKeyWindowNotes(4)
    expect(win[0]).toBe('B3')
    expect(win.at(-1)).toBe('E5')
    expect(win).toContain('F#4')
    expect(win).toContain('C#5')
    expect(win).toContain('D#5')
    expect(pitchPipeCOctaveNotes(4)).toHaveLength(13)
    expect(pitchPipeCOctaveNotes(4).at(-1)).toBe('C5')
    expect(pitchPipePcKeyOctave(['E3', 'F3', 'F#3'])).toBe(3)
    expect(pitchPipePcKeyOctave(pitchPipeNotes('c4-c5'))).toBe(4)
    const map = pitchPipePcKeyNoteMap(win)
    expect(map.get('KeyA')).toBe('B3')
    expect(map.get('KeyS')).toBe('C4')
    expect(map.get('KeyE')).toBe('C#4')
    expect(map.get('KeyD')).toBe('D4')
    expect(map.get('KeyR')).toBe('D#4')
    expect(map.get('KeyF')).toBe('E4')
    expect(map.get('KeyG')).toBe('F4')
    expect(map.get('KeyY')).toBe('F#4')
    expect(map.get('KeyH')).toBe('G4')
    expect(map.get('KeyU')).toBe('G#4')
    expect(map.get('KeyJ')).toBe('A4')
    expect(map.get('KeyI')).toBe('A#4')
    expect(map.get('KeyK')).toBe('B4')
    expect(map.get('KeyL')).toBe('C5')
    expect(map.get('BracketLeft')).toBe('C#5')
    expect(map.get('Semicolon')).toBe('D5')
    expect(map.get('BracketRight')).toBe('D#5')
    expect(map.get('Quote')).toBe('E5')
    expect(map.has('KeyO')).toBe(false)
  })

  it('provides a 66-key full piano and snaps grid scale', () => {
    const notes = pitchPipeFullKeyboardNotes()
    expect(notes).toHaveLength(66)
    expect(notes[0]).toBe('C2')
    expect(notes.at(-1)).toBe('F7')
    expect(normalizePitchPipeGridScale(93)).toBe(95)
    expect(normalizePitchPipeGridScale(50)).toBe(70)
    expect(normalizePitchPipeGridScale(300)).toBe(250)
    expect(normalizePitchPipeGridScale(247)).toBe(245)
    expect(normalizeSheetPianoKeyScale(93)).toBe(100)
    expect(normalizeSheetPianoKeyScale(50)).toBe(50)
    expect(normalizeSheetPianoKeyScale(20)).toBe(25)
    expect(normalizeSheetPianoKeyScale(400)).toBe(300)
    expect(normalizeSheetPianoKeyScale(null)).toBe(100)
    expect(normalizeSheetPianoKeyScale(undefined)).toBe(100)
    expect(normalizeSheetPianoKeyScale('')).toBe(100)
    expect(normalizeSheetPianoKeyScale(0)).toBe(100)
    expect(sheetPianoWhiteKeyPx(100)).toBe(51)
    expect(sheetPianoWhiteKeyPx(125)).toBe(63.8)
    expect(sheetPianoWhiteKeyPx(25)).toBe(12.8)
  })
})

describe('PitchPlayer', () => {
  it('starts and stops with a mocked AudioContext', async () => {
    const start = vi.fn()
    const stop = vi.fn()
    const connect = vi.fn()
    const oscillator = {
      type: '',
      frequency: { value: 0 },
      detune: { value: 0 },
      connect,
      start,
      stop,
    }
    const gain = {
      gain: {
        value: 0,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
      },
      connect: vi.fn(),
    }
    const ctx = {
      state: 'running',
      currentTime: 0,
      destination: {},
      resume: vi.fn(async () => {}),
      createOscillator: vi.fn(() => oscillator),
      createGain: vi.fn(() => gain),
      close: vi.fn(async () => {}),
    }
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function AudioContext() {
        return ctx
      }),
    )
    const p = new PitchPlayer()
    await p.start('A4', 10)
    expect(start).toHaveBeenCalled()
    expect(ctx.createOscillator).toHaveBeenCalled()
    p.dispose()
    expect(ctx.close).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
