import { describe, expect, it } from 'vitest'
import { createEmptyTagRollProject } from './normalize'
import { TAG_ROLL_SHEET_MAX_DIM, tagRollSheetLayout } from './sheetLayout'
import { TAG_ROLL_PPQ } from './types'

describe('tagRollSheetLayout', () => {
  it('pads midi range around notes and scales huge canvases', () => {
    const p = createEmptyTagRollProject({ title: 'Layout' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      {
        id: 'n1',
        partId: lead.id,
        midi: 60,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]
    p.lengthTicks = TAG_ROLL_PPQ * 4
    const layout = tagRollSheetLayout(p, { cellW: 20, cellH: 14 })
    expect(layout.midiMin).toBe(58)
    expect(layout.midiMax).toBe(62)
    expect(layout.width).toBeGreaterThan(0)
    expect(layout.height).toBeGreaterThan(0)
    expect(layout.width).toBeLessThanOrEqual(TAG_ROLL_SHEET_MAX_DIM)
    expect(layout.height).toBeLessThanOrEqual(TAG_ROLL_SHEET_MAX_DIM)
  })

  it('downscales when length would exceed max dimension', () => {
    const p = createEmptyTagRollProject()
    p.lengthTicks = TAG_ROLL_PPQ * 4000
    const layout = tagRollSheetLayout(p, { cellW: 28, cellH: 14 })
    expect(layout.scale).toBeLessThan(1)
    expect(Math.max(layout.width, layout.height)).toBeLessThanOrEqual(
      TAG_ROLL_SHEET_MAX_DIM,
    )
  })
})
