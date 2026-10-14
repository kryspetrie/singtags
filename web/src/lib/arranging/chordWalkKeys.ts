/**
 * Chord Walk keymap — pure matchers for Coach Chords / Harmonize.
 *
 * Precedence (caller enforces): not typing target; Roles-assign may steal
 * letter keys — Chord Walk letters only when assign-roles is off.
 *
 * Keyboard-first chord pass: ←→ notes, ↑↓ suggests, [/] inversion, W spread,
 * F/Enter apply, Tab apply+next Sketch / Shift+Tab previous Sketch, H hear, Q next empty.
 */

export type ChordWalkAction =
  | 'prevSuggest'
  | 'nextSuggest'
  | 'prevVoicing'
  | 'nextVoicing'
  | 'toggleSpread'
  | 'apply'
  | 'applyNextSketch'
  | 'prevSketch'
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
  if (!ctx.chordWalkActive || ctx.typingTarget) return null

  // Tab walks Sketch chords (Shift+Tab always previous). Allowed with Shift.
  if (ctx.key === 'Tab') {
    return ctx.shiftKey ? 'prevSketch' : 'applyNextSketch'
  }

  if (ctx.shiftKey) return null

  // ←→ navigate notes on the selected part (same as a note click) and sync the
  // Coach/Harmonize edit chord — handled by the editor, not Chord Walk.
  switch (ctx.key) {
    case 'ArrowUp':
      return 'prevSuggest'
    case 'ArrowDown':
      return 'nextSuggest'
    case '[':
      return 'prevVoicing'
    case ']':
      return 'nextVoicing'
    default:
      break
  }

  if (ctx.rolesAssignActive) return null

  // Enter and F both Apply (sketch vs stacks follows Harmonize/Coach mode).
  if (ctx.key === 'Enter' || ctx.key === 'f' || ctx.key === 'F') return 'apply'

  const k = ctx.key.length === 1 ? ctx.key.toLowerCase() : ctx.key
  if (k === 'w') return 'toggleSpread'
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
