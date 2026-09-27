import { describe, expect, it } from 'vitest'
import { noteBoxPitchName, paintNoteBoxLabel } from './noteBoxLabel'

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

describe('paintNoteBoxLabel', () => {
  function paintCapture(opts: Parameters<typeof paintNoteBoxLabel>[1]) {
    const calls: { text: string; font: string }[] = []
    let font = ''
    const ctx = {
      set fillStyle(_v: string) {},
      get font() {
        return font
      },
      set font(v: string) {
        font = v
      },
      textBaseline: 'alphabetic' as CanvasTextBaseline,
      measureText: (t: string) => ({ width: Math.max(1, t.length * 6) }),
      fillText: (t: string) => {
        calls.push({ text: t, font })
      },
    } as unknown as CanvasRenderingContext2D
    paintNoteBoxLabel(ctx, opts)
    return calls
  }

  const base = {
    midi: 70,
    startTick: 0,
    x: 0,
    y: 0,
    w: 80,
    h: 16,
    fillStyle: '#000',
    keyMarkers: undefined,
    keyFallback: { tonality: 0, tonalityMode: 'major' as const, preferFlats: true },
  }

  it('draws bold pitch name and italic lyric separately', () => {
    const calls = paintCapture({ ...base, lyric: 'love' })
    expect(calls).toHaveLength(2)
    expect(calls[0]!.text).toBe('Bb')
    expect(calls[0]!.font).toMatch(/^700 /)
    expect(calls[1]!.text).toBe(' love')
    expect(calls[1]!.font).toMatch(/italic/)
    expect(calls[1]!.font).toMatch(/400/)
  })

  it('honors showNoteName / showNoteLyric toggles', () => {
    expect(paintCapture({ ...base, lyric: 'hi', showNoteName: false })).toEqual([
      expect.objectContaining({ text: 'hi', font: expect.stringMatching(/italic/) }),
    ])
    expect(paintCapture({ ...base, lyric: 'hi', showNoteLyric: false })).toEqual([
      expect.objectContaining({ text: 'Bb', font: expect.stringMatching(/^700 /) }),
    ])
    expect(paintCapture({ ...base, lyric: 'hi', showNoteName: false, showNoteLyric: false })).toEqual(
      [],
    )
  })
})
