/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  shouldOpenChordsAfterSketchCommit,
  shouldToggleCloseLaneChord,
  sketchLaneClickEditAction,
  syncLaneChordSessionToSelection,
} from './sketchChordsWiring'

describe('sketchChordsWiring', () => {
  describe('shouldOpenChordsAfterSketchCommit', () => {
    it('opens for new non-blank paint', () => {
      expect(
        shouldOpenChordsAfterSketchCommit({
          writtenId: 'hs_1',
          quality: 'major',
        }),
      ).toBe(true)
    })

    it('skips blank placeholders', () => {
      expect(
        shouldOpenChordsAfterSketchCommit({
          writtenId: 'hs_1',
          quality: 'blank',
        }),
      ).toBe(false)
    })

    it('skips Tab-chained keepEditing', () => {
      expect(
        shouldOpenChordsAfterSketchCommit({
          writtenId: 'hs_1',
          quality: 'seventh',
          keepEditing: true,
        }),
      ).toBe(false)
    })

    it('skips edits of an existing span id', () => {
      expect(
        shouldOpenChordsAfterSketchCommit({
          payloadId: 'hs_1',
          writtenId: 'hs_1',
          quality: 'major',
        }),
      ).toBe(false)
    })

    it('skips failed writes', () => {
      expect(
        shouldOpenChordsAfterSketchCommit({
          writtenId: null,
          quality: 'major',
        }),
      ).toBe(false)
    })
  })

  describe('sketchLaneClickEditAction', () => {
    it('opens Chords for filled chords', () => {
      expect(sketchLaneClickEditAction('major')).toBe('chords')
      expect(sketchLaneClickEditAction('seventh')).toBe('chords')
    })

    it('keeps blanks in lane typeahead', () => {
      expect(sketchLaneClickEditAction('blank')).toBe('typeahead')
    })
  })

  describe('syncLaneChordSessionToSelection', () => {
    it('follows Tab walk to the selected Sketch id', () => {
      expect(
        syncLaneChordSessionToSelection(
          { variant: 'declared', segId: 'a' },
          ['b'],
        ),
      ).toEqual({ variant: 'declared', segId: 'b' })
    })

    it('clears declared chrome when selection is empty', () => {
      expect(
        syncLaneChordSessionToSelection({ variant: 'declared', segId: 'a' }, []),
      ).toBe(null)
    })

    it('keeps Detected session while that hole is still the target', () => {
      expect(
        syncLaneChordSessionToSelection(
          { variant: 'detected', segId: 'd1' },
          ['d1'],
        ),
      ).toEqual({ variant: 'detected', segId: 'd1' })
    })

    it('keeps Detected session when Sketch selection is empty', () => {
      expect(
        syncLaneChordSessionToSelection({ variant: 'detected', segId: 'd1' }, []),
      ).toEqual({ variant: 'detected', segId: 'd1' })
    })

    it('promotes chrome to declared when a Sketch span is selected', () => {
      expect(
        syncLaneChordSessionToSelection(
          { variant: 'detected', segId: 'd1' },
          ['hs_new'],
        ),
      ).toEqual({ variant: 'declared', segId: 'hs_new' })
    })

    it('creates declared chrome when Chords is open without a prior lane session', () => {
      expect(syncLaneChordSessionToSelection(null, ['hs_1'])).toEqual({
        variant: 'declared',
        segId: 'hs_1',
      })
    })
  })

  describe('shouldToggleCloseLaneChord', () => {
    it('closes only when the same cell is toggled while open', () => {
      expect(
        shouldToggleCloseLaneChord(
          true,
          { variant: 'declared', segId: 'a' },
          'declared',
          'a',
        ),
      ).toBe(true)
      expect(
        shouldToggleCloseLaneChord(
          true,
          { variant: 'declared', segId: 'a' },
          'declared',
          'b',
        ),
      ).toBe(false)
      expect(
        shouldToggleCloseLaneChord(false, { variant: 'declared', segId: 'a' }, 'declared', 'a'),
      ).toBe(false)
    })
  })
})
