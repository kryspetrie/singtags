/**
 * Gold / trial seed re-import must not wipe user Sketch after save→Back→reopen.
 */
export function seedHasUserSketch(
  sketch: readonly { locked?: boolean; source?: string }[] | null | undefined,
): boolean {
  return (sketch ?? []).some(
    (s) => s.locked && (s.source === 'user' || s.source === 'coach'),
  )
}
