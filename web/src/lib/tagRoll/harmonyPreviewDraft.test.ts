/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  previewDraftDirty,
  sketchSpansForAudition,
  type HarmonyPreviewDraft,
} from './harmonyPreviewDraft'
import type { HarmonySketchSpan } from './types'

function span(
  partial: Partial<HarmonySketchSpan> & Pick<HarmonySketchSpan, 'id' | 'startTick' | 'endTick' | 'rootPc'>,
): HarmonySketchSpan {
  return {
    quality: 'major',
    source: 'user',
    locked: true,
    ...partial,
  }
}

describe('harmonyPreviewDraft', () => {
  it('detects dirty vs baseline', () => {
    const d: HarmonyPreviewDraft = {
      id: 'a',
      startTick: 0,
      endTick: 480,
      rootPc: 7,
      quality: 'seventh',
      baseline: { rootPc: 0, quality: 'major' },
      source: 'popover',
    }
    expect(previewDraftDirty(d)).toBe(true)
    expect(
      previewDraftDirty({
        ...d,
        rootPc: 0,
        quality: 'major',
      }),
    ).toBe(false)
  })

  it('overlays preview and suppresses overlapping locked sketch', () => {
    const spans = [
      span({ id: 'c', startTick: 0, endTick: 480, rootPc: 0 }),
      span({ id: 'g', startTick: 480, endTick: 960, rootPc: 7, quality: 'seventh' }),
    ]
    const preview: HarmonyPreviewDraft = {
      id: 'g',
      startTick: 480,
      endTick: 960,
      rootPc: 2,
      quality: 'minor',
      baseline: { rootPc: 7, quality: 'seventh' },
      source: 'popover',
    }
    const out = sketchSpansForAudition(spans, preview)
    expect(out.map((s) => s.rootPc)).toEqual([0, 2])
    expect(out.some((s) => s.id.startsWith('preview:'))).toBe(true)
    expect(out.find((s) => s.id === 'g')).toBeUndefined()
  })

  it('injects preview into a hole with no locked span', () => {
    const spans = [span({ id: 'c', startTick: 0, endTick: 480, rootPc: 0 })]
    const preview: HarmonyPreviewDraft = {
      id: 'det-1',
      startTick: 480,
      endTick: 960,
      rootPc: 7,
      quality: 'seventh',
      baseline: null,
      source: 'harmonize',
    }
    const out = sketchSpansForAudition(spans, preview)
    expect(out).toHaveLength(2)
    expect(out[1]!.rootPc).toBe(7)
    expect(out[1]!.locked).toBe(true)
  })

  it('skips same-as-baseline preview over an existing lock', () => {
    const spans = [
      span({ id: 'g', startTick: 480, endTick: 960, rootPc: 7, quality: 'seventh' }),
    ]
    const preview: HarmonyPreviewDraft = {
      id: 'g',
      startTick: 480,
      endTick: 960,
      rootPc: 7,
      quality: 'seventh',
      baseline: { rootPc: 7, quality: 'seventh' },
      source: 'harmonize',
    }
    const out = sketchSpansForAudition(spans, preview)
    expect(out).toHaveLength(1)
    expect(out[0]!.id).toBe('g')
  })
})
