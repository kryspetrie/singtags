import { describe, expect, it, vi } from 'vitest'
import { clipboardFromCopy, clipboardFromCut } from './noteClipboardActions'

describe('noteClipboardActions', () => {
  it('clipboardFromCopy prefers inspect payload', () => {
    const inspect = vi.fn(() => ({
      notes: [{ midi: 60, startTick: 0, durationTicks: 100, partId: 'p' }],
      spanTicks: 200,
    }))
    expect(clipboardFromCopy(inspect, [])).toEqual({
      notes: [{ midi: 60, startTick: 0, durationTicks: 100, partId: 'p' }],
      spanTicks: 200,
    })
  })

  it('clipboardFromCut returns removeIds for plain selection', () => {
    const hit = clipboardFromCut(() => null, [
      { id: 'a', partId: 'p', midi: 60, startTick: 0, durationTicks: 100 },
    ])
    expect(hit?.removeIds).toEqual(['a'])
    expect(hit?.clip.notes[0]?.startTick).toBe(0)
  })
})
