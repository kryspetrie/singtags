import { describe, expect, it } from 'vitest'
import { createEmptyTagRollProject } from './normalize'
import { applyNoteClipboardAtPlayhead } from './pasteClipboard'
import { TAG_ROLL_PPQ } from './types'

describe('applyNoteClipboardAtPlayhead', () => {
  it('pastes section notes at the playhead', () => {
    const p = createEmptyTagRollProject({ title: 't' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.view.playheadTick = 960
    const applied = applyNoteClipboardAtPlayhead(
      p,
      {
        notes: [
          { midi: 60, startTick: 0, durationTicks: 240, partId: lead.id },
          { midi: 64, startTick: 240, durationTicks: 240, partId: lead.id },
        ],
        spanTicks: TAG_ROLL_PPQ,
      },
      () => 'new',
    )
    expect(applied?.origin).toBe(960)
    expect(applied?.spanTicks).toBe(TAG_ROLL_PPQ)
    expect(applied?.project.notes.map((n) => n.startTick)).toEqual([960, 1200])
  })
})
