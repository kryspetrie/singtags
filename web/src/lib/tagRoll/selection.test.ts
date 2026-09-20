import { describe, expect, it } from 'vitest'
import {
  clipboardToNotesAt,
  normalizeScreenBox,
  noteIdsInMarquee,
  notesToClipboard,
  rectsIntersect,
} from './selection'

describe('tagRoll selection', () => {
  it('normalizes marquee boxes', () => {
    expect(normalizeScreenBox(10, 20, 5, 8)).toEqual({ x: 5, y: 8, w: 5, h: 12 })
  })

  it('intersects notes with marquee', () => {
    const notes = [
      { id: 'a', partId: 'p', midi: 60, startTick: 0, durationTicks: 100 },
      { id: 'b', partId: 'q', midi: 62, startTick: 0, durationTicks: 100 },
    ]
    const ids = noteIdsInMarquee(
      notes,
      (n) => (n.id === 'a' ? { x: 0, y: 0, w: 10, h: 10 } : { x: 50, y: 50, w: 10, h: 10 }),
      { x: 2, y: 2, w: 20, h: 20 },
    )
    expect(ids).toEqual(['a'])
    expect(
      noteIdsInMarquee(
        notes,
        (n) => (n.id === 'a' ? { x: 0, y: 0, w: 10, h: 10 } : { x: 50, y: 50, w: 10, h: 10 }),
        { x: 2, y: 2, w: 20, h: 20 },
        { partId: 'q' },
      ),
    ).toEqual([])
  })

  it('clipboard round-trips relative to origin', () => {
    const clip = notesToClipboard([
      { id: '1', partId: 'p', midi: 60, startTick: 480, durationTicks: 240 },
      { id: '2', partId: 'q', midi: 64, startTick: 720, durationTicks: 240, lyric: 'oh' },
    ])
    expect(clip[0]!.startTick).toBe(0)
    expect(clip[1]!.startTick).toBe(240)
    const placed = clipboardToNotesAt(clip, 960, () => 'n')
    expect(placed[0]!.startTick).toBe(960)
    expect(placed[1]!.startTick).toBe(1200)
    expect(placed[1]!.lyric).toBe('oh')
  })

  it('rectsIntersect', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 2, h: 2 })).toBe(true)
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 0, w: 2, h: 2 })).toBe(false)
  })
})
