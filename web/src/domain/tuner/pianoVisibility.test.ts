import { describe, expect, it } from 'vitest'
import { shouldShowTunerPiano } from './pianoVisibility'

describe('shouldShowTunerPiano', () => {
  it('hides in Glance even when visible+pinned', () => {
    expect(
      shouldShowTunerPiano({
        pianoVisible: true,
        pianoPinned: true,
        mode: 'wide',
        glanceOpen: true,
      }),
    ).toBe(false)
  })

  it('forces off on short landscape unless pinned', () => {
    expect(
      shouldShowTunerPiano({
        pianoVisible: true,
        pianoPinned: false,
        mode: 'narrow-landscape',
        glanceOpen: false,
      }),
    ).toBe(false)
    expect(
      shouldShowTunerPiano({
        pianoVisible: true,
        pianoPinned: true,
        mode: 'narrow-landscape',
        glanceOpen: false,
      }),
    ).toBe(true)
  })

  it('respects pianoVisible on wide / portrait', () => {
    expect(
      shouldShowTunerPiano({
        pianoVisible: false,
        pianoPinned: false,
        mode: 'wide',
        glanceOpen: false,
      }),
    ).toBe(false)
    expect(
      shouldShowTunerPiano({
        pianoVisible: true,
        pianoPinned: false,
        mode: 'narrow-portrait',
        glanceOpen: false,
      }),
    ).toBe(true)
  })
})
