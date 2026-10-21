/**
 * Pure helpers for Sketch lane ↔ Chords panel wiring (open gates, session chrome, edit action).
 */

export type LaneChordSession = {
  variant: 'declared' | 'detected'
  segId: string
}

/**
 * After paint / inline commit: open Chords on newly defined non-blank chords only.
 * Tab-chained blanks and edits of existing ids stay in the lane.
 */
export function shouldOpenChordsAfterSketchCommit(opts: {
  /** Existing span id when editing; undefined for new paint. */
  payloadId?: string
  keepEditing?: boolean
  quality: string
  writtenId: string | null | undefined
}): boolean {
  return (
    !opts.payloadId &&
    !!opts.writtenId &&
    !opts.keepEditing &&
    opts.quality !== 'blank'
  )
}

/** Click on a Sketch cell: blanks stay in typeahead; filled chords open Chords. */
export function sketchLaneClickEditAction(
  quality: string | null | undefined,
): 'chords' | 'typeahead' {
  return quality === 'blank' ? 'typeahead' : 'chords'
}

/**
 * Keep lane menu chrome (`editSegId`) aligned with Sketch selection while Chords is open
 * (Tab walk, Apply+next, click retarget).
 */
export function syncLaneChordSessionToSelection(
  session: LaneChordSession | null,
  selectedIds: readonly string[],
): LaneChordSession | null {
  const id = selectedIds[0]
  if (!id) {
    // No Sketch selection — drop declared chrome; keep Detected until Apply promotes.
    if (session?.variant === 'detected') return session
    return null
  }
  if (session?.variant === 'detected' && session.segId === id) return session
  if (session?.variant === 'declared' && session.segId === id) return session
  return { variant: 'declared', segId: id }
}

/** Toggle-same-cell: close when the open session matches the clicked cell. */
export function shouldToggleCloseLaneChord(
  open: boolean,
  session: LaneChordSession | null,
  variant: 'declared' | 'detected',
  segId: string,
): boolean {
  return open && session?.variant === variant && session.segId === segId
}
