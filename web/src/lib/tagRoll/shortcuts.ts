/**
 * Tag Studio keyboard shortcut catalog (display + matching).
 */

export type TagRollShortcut = {
  id: string
  keys: string
  label: string
  group: 'modes' | 'transport' | 'edit' | 'duration' | 'parts' | 'harmonize' | 'nav'
}

export const TAG_ROLL_SHORTCUTS: readonly TagRollShortcut[] = [
  { id: 'mode-view', keys: 'V', label: 'View mode', group: 'modes' },
  { id: 'mode-compose', keys: 'E', label: 'Compose mode', group: 'modes' },
  { id: 'mode-lyrics', keys: 'Y', label: 'Lyrics mode', group: 'modes' },
  { id: 'play-pause', keys: 'Space', label: 'Play / stop (return to playback start)', group: 'transport' },
  { id: 'pause-enter', keys: 'Enter', label: 'Pause in place', group: 'transport' },
  { id: 'stop', keys: 'S', label: 'Stop — return to playback start', group: 'transport' },
  { id: 'return-zero', keys: 'Home', label: 'Go to beginning', group: 'transport' },
  { id: 'hear-stack', keys: 'H', label: 'Play stack at cursor', group: 'transport' },
  { id: 'playhead-left', keys: ',', label: 'Move playhead left (grid)', group: 'transport' },
  { id: 'playhead-right', keys: '.', label: 'Move playhead right (grid)', group: 'transport' },
  { id: 'cursor-left', keys: '←', label: 'Move playhead left (view / no selection)', group: 'transport' },
  { id: 'cursor-right', keys: '→', label: 'Move playhead right (view / no selection)', group: 'transport' },
  { id: 'note-up', keys: '↑', label: 'Move selected note(s) up a semitone', group: 'edit' },
  { id: 'note-down', keys: '↓', label: 'Move selected note(s) down a semitone', group: 'edit' },
  { id: 'note-left', keys: '←', label: 'Move selected note(s) left (grid)', group: 'edit' },
  { id: 'note-right', keys: '→', label: 'Move selected note(s) right (grid)', group: 'edit' },
  { id: 'undo', keys: 'Ctrl+Z', label: 'Undo', group: 'edit' },
  { id: 'redo', keys: 'Ctrl+Shift+Z', label: 'Redo', group: 'edit' },
  { id: 'delete', keys: 'Del', label: 'Delete selected note(s) / expression', group: 'edit' },
  { id: 'deselect', keys: 'Esc', label: 'Close panel / clear tool / deselect', group: 'edit' },
  { id: 'select-all', keys: 'Ctrl+A', label: 'Select all notes', group: 'edit' },
  { id: 'copy', keys: 'Ctrl+C', label: 'Copy selected notes', group: 'edit' },
  { id: 'paste', keys: 'Ctrl+V', label: 'Paste at playhead', group: 'edit' },
  { id: 'marquee', keys: 'Drag empty', label: 'Marquee-select notes', group: 'edit' },
  { id: 'multi-add', keys: 'Ctrl+Click', label: 'Toggle note in selection; empty places a note', group: 'edit' },
  { id: 'pan-shift', keys: 'Shift+drag', label: 'Pan the grid (or use Hand tool)', group: 'nav' },
  { id: 'pointer-edit', keys: '', label: 'Edit pointer — place / select notes', group: 'nav' },
  { id: 'pointer-pan', keys: '', label: 'Hand tool — drag to pan the grid', group: 'nav' },
  { id: 'dur-1', keys: '1', label: 'Whole note', group: 'duration' },
  { id: 'dur-2', keys: '2', label: 'Half note', group: 'duration' },
  { id: 'dur-3', keys: '3', label: 'Quarter note', group: 'duration' },
  { id: 'dur-4', keys: '4', label: 'Eighth note', group: 'duration' },
  { id: 'dur-5', keys: '5', label: 'Sixteenth note', group: 'duration' },
  { id: 'dur-6', keys: '6', label: '32nd note', group: 'duration' },
  { id: 'dur-shorter', keys: '[', label: 'Shorter note length', group: 'duration' },
  { id: 'dur-longer', keys: ']', label: 'Longer note length', group: 'duration' },
  { id: 'dur-dot', keys: 'Shift+.', label: 'Dot note (+½ value)', group: 'duration' },
  { id: 'part-tenor', keys: 'T', label: 'Select Tenor', group: 'parts' },
  { id: 'part-lead', keys: 'L', label: 'Select Lead', group: 'parts' },
  { id: 'part-bari', keys: 'R', label: 'Select Bari', group: 'parts' },
  { id: 'part-bass', keys: 'B', label: 'Select Bass', group: 'parts' },
  { id: 'part-cycle', keys: 'C', label: 'Cycle to next part', group: 'parts' },
  { id: 'part-custom', keys: 'Parts…', label: 'Assign keys for extra parts', group: 'parts' },
  { id: 'harmonize', keys: 'M', label: 'Open harmonizer', group: 'harmonize' },
  { id: 'harm-prev', keys: '[', label: 'Previous melody note (while Harmonize open)', group: 'harmonize' },
  { id: 'harm-next', keys: ']', label: 'Next melody note (while Harmonize open)', group: 'harmonize' },
  { id: 'harm-cancel', keys: 'Ctrl+Backspace', label: 'Cancel last harmony', group: 'harmonize' },
  { id: 'shortcuts', keys: '?', label: 'Show keyboard shortcuts', group: 'nav' },
  { id: 'zoom-time', keys: 'Scroll', label: 'Zoom time', group: 'nav' },
  { id: 'pan-pitch', keys: 'Shift+Scroll', label: 'Pan pitch', group: 'nav' },
  { id: 'pan-drag', keys: 'Drag empty', label: 'Pan the roll', group: 'nav' },
] as const

const BY_ID = new Map(TAG_ROLL_SHORTCUTS.map((s) => [s.id, s]))

export function getTagRollShortcut(id: string): TagRollShortcut | undefined {
  return BY_ID.get(id)
}

/**
 * Native hover tooltip text: “Label (Shortcut)”.
 * Pass keys when the control has a shortcut; omit for unlabeled actions.
 */
export function tagRollTip(label: string, keys?: string | null): string {
  const text = label.trim()
  const k = typeof keys === 'string' ? keys.trim() : ''
  if (!k) return text
  const suffix = `(${k})`
  if (text.endsWith(suffix) || text.includes(` ${suffix}`)) return text
  return `${text} ${suffix}`
}

/** Tooltip from catalog id, with optional label override. */
export function tipByShortcutId(id: string, labelOverride?: string): string {
  const s = getTagRollShortcut(id)
  if (!s) return labelOverride?.trim() || id
  return tagRollTip(labelOverride ?? s.label, s.keys)
}

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return el.isContentEditable
}

export function matchModKey(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey
}
