import { describe, expect, it } from 'vitest'
import { buildQuickSequence } from './quickAddChips'
import {
  resolveAdvanceStep,
  resolveQuickKeydown,
  resolveRetreatStep,
  shouldBlockAdvanceFromTitle,
} from './quickAddKeydown'

const seq = buildQuickSequence(['lead'], { lead: 2 })

describe('resolveQuickKeydown', () => {
  it('toggles tag / know on space', () => {
    expect(
      resolveQuickKeydown(
        { key: ' ', shiftKey: false },
        {
          cursor: { kind: 'tag' },
          titleField: 'A',
          linkLabel: '',
          linkQuery: '',
          linkHighlight: -1,
          linkHitCount: 0,
          sequence: seq,
        },
      ).action,
    ).toEqual({ type: 'toggle-is-tag' })

    expect(
      resolveQuickKeydown(
        { key: ' ', shiftKey: false },
        {
          cursor: { kind: 'part-know', partId: 'lead' },
          titleField: 'A',
          linkLabel: '',
          linkQuery: '',
          linkHighlight: -1,
          linkHitCount: 0,
          sequence: seq,
        },
      ).action,
    ).toEqual({ type: 'toggle-know', partId: 'lead' })
  })

  it('handles link highlight and pick', () => {
    const ctx = {
      cursor: { kind: 'link' as const },
      titleField: 'A',
      linkLabel: '',
      linkQuery: 'x',
      linkHighlight: 0,
      linkHitCount: 3,
      sequence: seq,
    }
    expect(resolveQuickKeydown({ key: 'ArrowDown', shiftKey: false }, ctx).action).toEqual({
      type: 'set-highlight',
      index: 1,
    })
    expect(resolveQuickKeydown({ key: 'Enter', shiftKey: false }, ctx).action).toEqual({
      type: 'pick-link',
      index: 0,
    })
    expect(
      resolveQuickKeydown(
        { key: 'Escape', shiftKey: false },
        { ...ctx, linkLabel: 'L' },
      ).stopPropagation,
    ).toBe(true)
  })

  it('rates parts and advances', () => {
    const rateCtx = {
      cursor: { kind: 'part-rate' as const, partId: 'lead' },
      titleField: 'A',
      linkLabel: '',
      linkQuery: '',
      linkHighlight: -1,
      linkHitCount: 0,
      sequence: seq,
    }
    expect(resolveQuickKeydown({ key: '4', shiftKey: false }, rateCtx).action).toEqual({
      type: 'set-part-conf',
      partId: 'lead',
      conf: 4,
    })
    expect(resolveQuickKeydown({ key: 'ArrowUp', shiftKey: false }, rateCtx).action).toEqual({
      type: 'nudge-part-conf',
      delta: 1,
    })
    expect(
      resolveQuickKeydown(
        { key: 'Enter', shiftKey: true },
        { ...rateCtx, cursor: { kind: 'title' } },
      ).action,
    ).toEqual({ type: 'commit' })
    expect(
      resolveQuickKeydown(
        { key: 'Tab', shiftKey: false },
        { ...rateCtx, cursor: { kind: 'title' } },
      ).action,
    ).toEqual({ type: 'advance' })
  })
})

describe('advance / retreat', () => {
  it('blocks empty title', () => {
    expect(shouldBlockAdvanceFromTitle({ kind: 'title' }, '  ')).toBe(true)
    expect(resolveAdvanceStep({ kind: 'title' }, seq, '')).toEqual({ type: 'none' })
  })

  it('advances and retreats along sequence', () => {
    expect(resolveAdvanceStep({ kind: 'title' }, seq, 'Hello')).toEqual({
      type: 'set-cursor',
      cursor: { kind: 'arranger' },
    })
    expect(resolveRetreatStep({ kind: 'arranger' }, seq)).toEqual({ kind: 'title' })
    expect(resolveRetreatStep({ kind: 'title' }, seq)).toBeNull()
  })

  it('commits on last step with title', () => {
    const last = seq[seq.length - 1]!
    expect(resolveAdvanceStep(last, seq, 'Hello')).toEqual({ type: 'commit' })
  })
})
