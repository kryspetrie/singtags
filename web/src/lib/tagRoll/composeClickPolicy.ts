/**
 * Compose-mode empty-click policy: first empty click deselects; second places.
 * Ctrl/Cmd+click places immediately so adding a note does not need two clicks.
 */
export function composeEmptyClickAction(
  hasSelectedNote: boolean,
  opts?: { forcePlace?: boolean },
): 'deselect' | 'place' {
  if (opts?.forcePlace) return 'place'
  return hasSelectedNote ? 'deselect' : 'place'
}
