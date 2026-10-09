/**
 * Chord Walk keymap — pure matchers for Coach Chords / Harmonize.
 *
 * Precedence (caller enforces): not typing target; Roles-assign may steal
 * letter keys — Chord Walk letters only when assign-roles is off.
 */

export type ChordWalkAction =
  | 'prevMoment'
  | 'nextMoment'
  | 'prevSuggest'
  | 'nextSuggest'
  | 'apply'
  | 'hear'
  | 'nextEmpty'

export type ChordWalkKeyContext = {
  /** Coach Chords (choose) or Harmonize suggest active. */
  chordWalkActive: boolean
  /** Focus is an input / textarea / contenteditable. */
  typingTarget: boolean
  /** Toolbar Roles assign mode — letter hotkeys conflict. */
  rolesAssignActive: boolean
  shiftKey: boolean
  /** Key from KeyboardEvent.key */
  key: string
}

/**
 * Map a keydown to a Chord Walk action, or null if not handled.
 */
export function matchChordWalkKey(ctx: ChordWalkKeyContext): ChordWalkAction | null {
  if (!ctx.chordWalkActive || ctx.typingTarget || ctx.shiftKey) return null

  switch (ctx.key) {
    case 'ArrowLeft':
      return 'prevMoment'
    case 'ArrowRight':
      return 'nextMoment'
    case 'ArrowUp':
      return 'prevSuggest'
    case 'ArrowDown':
      return 'nextSuggest'
    default:
      break
  }

  if (ctx.rolesAssignActive) return null

  const k = ctx.key.length === 1 ? ctx.key.toLowerCase() : ctx.key
  if (k === 'f') return 'apply'
  if (k === 'h') return 'hear'
  if (k === 'q') return 'nextEmpty'
  return null
}

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return !!el.closest('[contenteditable="true"]')
}
