/**
 * Pure quick-add keyboard → action resolver for Sing Together.
 */
import { nextHighlightIndex, sameCursor, type QuickCursor } from './quickAddChips'
import { parseTitleField } from './songMeta'

export type QuickKeyAction =
  | { type: 'toggle-is-tag' }
  | { type: 'toggle-know'; partId: string }
  | { type: 'set-highlight'; index: number }
  | { type: 'pick-link'; index: number }
  | { type: 'clear-link' }
  | { type: 'set-part-conf'; partId: string; conf: number }
  | { type: 'nudge-part-conf'; delta: number }
  | { type: 'commit' }
  | { type: 'advance' }
  | { type: 'set-cursor'; cursor: QuickCursor }
  | { type: 'none' }

export type QuickKeyResult = {
  action: QuickKeyAction
  preventDefault: boolean
  stopPropagation: boolean
}

export type QuickKeyContext = {
  cursor: QuickCursor
  titleField: string
  linkLabel: string
  linkQuery: string
  linkHighlight: number
  linkHitCount: number
  sequence: readonly QuickCursor[]
}

const NONE: QuickKeyResult = {
  action: { type: 'none' },
  preventDefault: false,
  stopPropagation: false,
}

function prevent(action: QuickKeyAction, stop = false): QuickKeyResult {
  return { action, preventDefault: true, stopPropagation: stop }
}

/** Resolve a quick-add keydown into a UI action (no side effects). */
export function resolveQuickKeydown(
  ev: Pick<KeyboardEvent, 'key' | 'shiftKey'>,
  ctx: QuickKeyContext,
): QuickKeyResult {
  if (ctx.cursor.kind === 'tag' && ev.key === ' ') {
    return prevent({ type: 'toggle-is-tag' })
  }
  if (ctx.cursor.kind === 'part-know' && ev.key === ' ') {
    return prevent({ type: 'toggle-know', partId: ctx.cursor.partId })
  }
  if (ctx.cursor.kind === 'link') {
    if (ev.key === 'ArrowDown' && ctx.linkHitCount) {
      return prevent({
        type: 'set-highlight',
        index: nextHighlightIndex(ctx.linkHighlight, ctx.linkHitCount, 1),
      })
    }
    if (ev.key === 'ArrowUp' && ctx.linkHitCount) {
      return prevent({
        type: 'set-highlight',
        index: nextHighlightIndex(ctx.linkHighlight, ctx.linkHitCount, -1),
      })
    }
    if (ev.key === 'Enter' && !ev.shiftKey && ctx.linkHighlight >= 0) {
      return prevent({ type: 'pick-link', index: ctx.linkHighlight })
    }
    if (ev.key === 'Escape' && (ctx.linkLabel || ctx.linkQuery)) {
      return prevent({ type: 'clear-link' }, true)
    }
  }
  if (ctx.cursor.kind === 'part-rate') {
    if (ev.key >= '0' && ev.key <= '5') {
      return prevent({
        type: 'set-part-conf',
        partId: ctx.cursor.partId,
        conf: Number(ev.key),
      })
    }
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') {
      return prevent({ type: 'nudge-part-conf', delta: 1 })
    }
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') {
      return prevent({ type: 'nudge-part-conf', delta: -1 })
    }
  }
  if (ev.key === 'Enter') {
    if (ev.shiftKey) return prevent({ type: 'commit' })
    return prevent({ type: 'advance' })
  }
  if (ev.key === 'Tab' && !ev.shiftKey) {
    return prevent({ type: 'advance' })
  }
  if (ev.key === 'Tab' && ev.shiftKey) {
    const idx = ctx.sequence.findIndex((c) => sameCursor(c, ctx.cursor))
    if (idx > 0) {
      return prevent({ type: 'set-cursor', cursor: ctx.sequence[idx - 1]! })
    }
  }
  return NONE
}

/** Whether advance from title should be blocked (empty primary title). */
export function shouldBlockAdvanceFromTitle(
  cursor: QuickCursor,
  titleField: string,
): boolean {
  return cursor.kind === 'title' && !parseTitleField(titleField).title
}

/** Next cursor after advance, or commit/null signals. */
export function resolveAdvanceStep(
  cursor: QuickCursor,
  sequence: readonly QuickCursor[],
  titleField: string,
): { type: 'set-cursor'; cursor: QuickCursor } | { type: 'commit' } | { type: 'none' } {
  const idx = sequence.findIndex((c) => sameCursor(c, cursor))
  if (idx < 0) return { type: 'none' }
  if (shouldBlockAdvanceFromTitle(cursor, titleField)) return { type: 'none' }
  if (idx >= sequence.length - 1) {
    return parseTitleField(titleField).title ? { type: 'commit' } : { type: 'none' }
  }
  return { type: 'set-cursor', cursor: sequence[idx + 1]! }
}

export function resolveRetreatStep(
  cursor: QuickCursor,
  sequence: readonly QuickCursor[],
): QuickCursor | null {
  const idx = sequence.findIndex((c) => sameCursor(c, cursor))
  if (idx > 0) return sequence[idx - 1]!
  return null
}
