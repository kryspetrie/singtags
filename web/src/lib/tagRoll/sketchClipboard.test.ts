/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  clipboardSpansAtPlayhead,
  spansToClipboard,
} from './sketchClipboard'
import type { HarmonySketchSpan } from './types'

describe('sketchClipboard', () => {
  const spans: HarmonySketchSpan[] = [
    {
      id: 'a',
      startTick: 480,
      endTick: 960,
      rootPc: 0,
      quality: 'major',
      source: 'user',
      locked: true,
    },
    {
      id: 'b',
      startTick: 960,
      endTick: 1440,
      rootPc: 7,
      quality: 'seventh',
      source: 'user',
      locked: true,
    },
  ]

  it('stores relative ticks from the earliest span', () => {
    const clip = spansToClipboard(spans)
    expect(clip).not.toBeNull()
    expect(clip!.spans[0]).toMatchObject({ startTick: 0, durationTicks: 480, rootPc: 0 })
    expect(clip!.spans[1]).toMatchObject({ startTick: 480, durationTicks: 480, rootPc: 7 })
    expect(clip!.spanTicks).toBe(960)
  })

  it('pastes relative to playhead', () => {
    const clip = spansToClipboard(spans)!
    const placed = clipboardSpansAtPlayhead(clip, 1920, 10000)
    expect(placed).toEqual([
      { startTick: 1920, endTick: 2400, rootPc: 0, quality: 'major' },
      { startTick: 2400, endTick: 2880, rootPc: 7, quality: 'seventh' },
    ])
  })
})
