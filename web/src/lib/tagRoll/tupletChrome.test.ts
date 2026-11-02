/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createTupletContainer } from './tupletContainers'
import { paintTupletBands, tupletBadgeLabel, tupletKindLabel } from './tupletChrome'
import { TAG_ROLL_PPQ } from './types'

describe('tupletChrome', () => {
  it('badge uses 3 / 6 / a:n', () => {
    expect(tupletBadgeLabel({ actualNotes: 3, normalNotes: 2 })).toBe('3')
    expect(tupletBadgeLabel({ actualNotes: 6, normalNotes: 4 })).toBe('6')
    expect(tupletBadgeLabel({ actualNotes: 5, normalNotes: 4 })).toBe('5')
    expect(tupletBadgeLabel({ actualNotes: 7, normalNotes: 4 })).toBe('7:4')
  })

  it('kind label uses Triplet / Sextuplet / a:n', () => {
    expect(tupletKindLabel({ actualNotes: 3, normalNotes: 2 })).toBe('Triplet')
    expect(tupletKindLabel({ actualNotes: 6, normalNotes: 4 })).toBe('Sextuplet')
    expect(tupletKindLabel({ actualNotes: 5, normalNotes: 4 })).toBe('Quintuplet')
    expect(tupletKindLabel({ actualNotes: 7, normalNotes: 4 })).toBe('7:4')
  })

  it('paintTupletBands returns a rect for each container', () => {
    const calls: string[] = []
    const ctx = {
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      fillRect: () => calls.push('fillRect'),
      strokeRect: () => calls.push('strokeRect'),
      setLineDash: () => {},
      fillText: () => calls.push('fillText'),
      globalAlpha: 1,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textBaseline: 'top' as CanvasTextBaseline,
    } as unknown as CanvasRenderingContext2D
    const t = createTupletContainer({
      id: 'tup1',
      partId: 'lead',
      startTick: 0,
      spanTicks: TAG_ROLL_PPQ,
      actualNotes: 3,
      normalNotes: 2,
    })
    const rects = paintTupletBands(ctx, [t], {
      scrollX: 0,
      bandY: 20,
      bandH: 100,
      ticksToPx: (tick, cellW) => (tick / TAG_ROLL_PPQ) * cellW,
      cellW: 48,
      selectedId: 'tup1',
      partColor: () => '#0ea5e9',
    })
    expect(rects).toHaveLength(1)
    expect(rects[0]!.id).toBe('tup1')
    expect(rects[0]!.w).toBeGreaterThan(0)
    expect(calls).toContain('fillRect')
    expect(calls).toContain('fillText')
  })
})
