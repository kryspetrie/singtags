import { describe, expect, it } from 'vitest'
import {
  coachGhostsForVoicing,
  coachPreviewFromCandidate,
  coachSketchPreviewDraft,
} from './coachChordPreview'
import type { HarmonizeCandidate } from '../../domain/arranging/harmonize'

describe('coachChordPreview', () => {
  it('builds a coach sketch draft spanning the moment', () => {
    const d = coachSketchPreviewDraft(480, 240, 7, 'seventh')
    expect(d).toMatchObject({
      startTick: 480,
      endTick: 720,
      rootPc: 7,
      quality: 'seventh',
      source: 'coach',
      baseline: null,
    })
  })

  it('builds TTBB ghosts from a candidate', () => {
    const c = {
      rootPc: 0,
      natureId: 'major',
      voicing: 'root',
      spread: false,
      layer: 'primary',
      midi: { bass: 48, bari: 60, lead: 67, tenor: 72 },
      score: 1,
      ruleTags: [],
      label: 'C',
    } satisfies HarmonizeCandidate
    const { draft, ghosts } = coachPreviewFromCandidate(c, 0, 480, () => '#000')
    expect(draft.source).toBe('coach')
    expect(ghosts.map((g) => g.role)).toEqual(['tenor', 'bari', 'bass'])
    expect(coachGhostsForVoicing(c, 0, 480, () => '#111')).toHaveLength(3)
  })
})
