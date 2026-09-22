/**
 * Coach → roll selection helpers (keep TagRollEditorView under god-file budget).
 * Range focus (pillars / moments) drives the L/R chord-cursor bounds; tick focus clears it.
 */
import { ref } from 'vue'
import {
  noteIdsAtTick,
  noteIdsAtTickForPart,
  noteIdsForPillarInspect,
  noteIdsInRange,
} from '../lib/arranging/selectNotesAtTick'
import {
  confirmDeleteInspectRangeNotes,
  resolveInspectPlayback,
  type InspectRange,
} from '../lib/tagRoll/chordCursorTransport'
import { sectionClipboardFromRange, carveNotesInRange, type TagRollNoteClipboard } from '../lib/tagRoll/selection'
import type { TagRollNote, TagRollProject } from '../lib/tagRoll/types'

export type CoachFocusStore = {
  selectNotes: (ids: string[]) => void
  setPlayheadTick: (tick: number, opts?: { snap?: boolean }) => void
  deleteNotes?: (ids: readonly string[]) => void
  replaceNotesFromExternal?: (notes: TagRollNote[]) => void
  nextNoteId?: () => string
}

export type ChordCursorHighlight = InspectRange

/** How note selection follows an inspect-range update. */
export type ChordCursorSelectMode = 'range' | 'column' | 'pillar' | 'none'

export function useTagRollCoachFocus(
  getProject: () => TagRollProject | null | undefined,
  store: CoachFocusStore,
) {
  /** Inspect range: ruler drag or coach range nav (pillars / moments). */
  const chordCursor = ref<ChordCursorHighlight | null>(null)
  /** When set, natural playback end rewinds here (inspect-range play). */
  const playbackRewindTick = ref<number | null>(null)

  function clearChordCursor(): void {
    chordCursor.value = null
  }

  /**
   * Shows L/R bounds. Default note pick is the start column — never mass-select
   * a whole pillar/moment span (that looked like “select the entire score”).
   * Coach pillar / uncovered nav should pass `select: 'none'` so edit selection
   * is cleared (overlay only).
   */
  function setChordCursor(
    range: ChordCursorHighlight,
    opts?: { select?: ChordCursorSelectMode },
  ): void {
    const p = getProject()
    if (!p) return
    const start = Math.max(0, Math.round(range.startTick))
    const end = Math.max(start + 1, Math.round(range.endTick))
    chordCursor.value = { startTick: start, endTick: end }
    const mode = opts?.select ?? 'column'
    let playAt = start
    if (mode === 'range') store.selectNotes(noteIdsInRange(p, start, end))
    else if (mode === 'pillar') {
      const ids = noteIdsForPillarInspect(p, start, end)
      store.selectNotes(ids)
      const hit = ids[0] ? p.notes.find((n) => n.id === ids[0]) : null
      if (hit) playAt = hit.startTick
    } else if (mode === 'column') store.selectNotes(noteIdsAtTick(p, start))
    else store.selectNotes([])
    store.setPlayheadTick(playAt, { snap: false })
  }

  function onCoachFocusTick(tick: number): void {
    const p = getProject()
    if (!p) return
    clearChordCursor()
    store.selectNotes(noteIdsAtTick(p, tick))
    store.setPlayheadTick(tick, { snap: false })
  }

  /**
   * Pillar / moment / chord-bar range — L/R bounds + note pick.
   * Pass `pillar` so held Lead posts (Lilly) don’t steal the selection.
   */
  function onCoachFocusRange(
    start: number,
    end: number,
    select: ChordCursorSelectMode = 'column',
  ): void {
    setChordCursor({ startTick: start, endTick: end }, { select })
  }

  function onCoachFocusPart(tick: number, partName: string): void {
    const p = getProject()
    if (!p) return
    clearChordCursor()
    store.selectNotes(noteIdsAtTickForPart(p, tick, partName))
    store.setPlayheadTick(tick, { snap: false })
  }

  /** Arm inspect-range play; returns bounds or null for full-project transport. */
  function armInspectPlayback(playheadTick: number) {
    const bounds = resolveInspectPlayback(chordCursor.value, playheadTick)
    playbackRewindTick.value = bounds?.rewindTick ?? null
    return bounds
  }

  function clearInspectPlaybackRewind(): void {
    playbackRewindTick.value = null
  }

  /** Apply pending rewind after natural end; returns tick or null. */
  function takeInspectPlaybackRewind(): number | null {
    const t = playbackRewindTick.value
    playbackRewindTick.value = null
    return t
  }

  /**
   * Delete every note in the inspect range (with confirm). Returns true if handled
   * (including cancel); false when there is no inspect range — caller may fall back.
   */
  function carveInspectRange(c: InspectRange, p: TagRollProject): boolean {
    if (store.replaceNotesFromExternal && store.nextNoteId) {
      store.replaceNotesFromExternal(carveNotesInRange(p.notes, c, store.nextNoteId))
      return true
    }
    if (store.deleteNotes) {
      store.deleteNotes(noteIdsInRange(p, c.startTick, c.endTick))
      store.selectNotes([])
      return true
    }
    return false
  }

  function tryDeleteInspectRangeNotes(ask?: (message: string) => boolean): boolean {
    const c = chordCursor.value
    const p = getProject()
    if (!c || !p) return false
    const clip = sectionClipboardFromRange(p.notes, c)
    if (!clip) return true
    if (!confirmDeleteInspectRangeNotes(clip.notes.length, ask)) return true
    return carveInspectRange(c, p)
  }

  /** Copy notes in the inspect range, anchored to the left bound (sliced at bounds). */
  function tryCopyInspectRangeNotes(): TagRollNoteClipboard | null {
    const c = chordCursor.value
    const p = getProject()
    if (!c || !p) return null
    return sectionClipboardFromRange(p.notes, c)
  }

  /** Cut: copy sliced section then carve the interior (no confirm — Cut is explicit). */
  function tryCutInspectRangeNotes(): TagRollNoteClipboard | null {
    const c = chordCursor.value
    const p = getProject()
    if (!c || !p) return null
    const clip = sectionClipboardFromRange(p.notes, c)
    if (!clip) return null
    if (!carveInspectRange(c, p)) return null
    clearChordCursor()
    return clip
  }

  return {
    chordCursor,
    clearChordCursor,
    setChordCursor,
    onCoachFocusTick,
    onCoachFocusRange,
    onCoachFocusPart,
    armInspectPlayback,
    clearInspectPlaybackRewind,
    takeInspectPlaybackRewind,
    tryDeleteInspectRangeNotes,
    tryCopyInspectRangeNotes,
    tryCutInspectRangeNotes,
  }
}
