import { describe, expect, it } from 'vitest'
import { hitNoteResizeEdge, resizeNoteByEdge } from './noteResize'

describe('noteResize', () => {
  const rect = { x: 100, y: 40, w: 80, h: 16 }

  it('hits start and end handles', () => {
    expect(hitNoteResizeEdge(102, 45, rect, 8, true)).toBe('start')
    expect(hitNoteResizeEdge(175, 45, rect, 8, true)).toBe('end')
    expect(hitNoteResizeEdge(140, 45, rect, 8, true)).toBeNull()
    expect(hitNoteResizeEdge(102, 45, rect, 8, false)).toBeNull()
  })

  it('splits narrow notes at midpoint', () => {
    const narrow = { x: 0, y: 0, w: 10, h: 12 }
    expect(hitNoteResizeEdge(2, 5, narrow, 8, true)).toBe('start')
    expect(hitNoteResizeEdge(8, 5, narrow, 8, true)).toBe('end')
  })

  it('stretches end forward and start backward', () => {
    const origin = { startTick: 480, durationTicks: 240 }
    expect(resizeNoteByEdge('end', 120, origin, { snapTicks: 120, lengthTicks: 5000 })).toEqual({
      startTick: 480,
      durationTicks: 360,
    })
    expect(resizeNoteByEdge('start', -120, origin, { snapTicks: 120, lengthTicks: 5000 })).toEqual({
      startTick: 360,
      durationTicks: 360,
    })
  })

  it('clamps start so duration stays at least snap', () => {
    const origin = { startTick: 480, durationTicks: 240 }
    expect(resizeNoteByEdge('start', 500, origin, { snapTicks: 120, lengthTicks: 5000 })).toEqual({
      startTick: 600,
      durationTicks: 120,
    })
    expect(resizeNoteByEdge('start', -2000, origin, { snapTicks: 120, lengthTicks: 5000 })).toEqual({
      startTick: 0,
      durationTicks: 720,
    })
  })
})
