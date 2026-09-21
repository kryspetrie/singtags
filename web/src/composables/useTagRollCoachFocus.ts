/**
 * Coach → roll selection helpers (keep TagRollEditorView under god-file budget).
 * Chord-cursor overlay is user-driven (ruler drag); coach nav only selects notes.
 */
import { ref } from 'vue'
import {
  noteIdsAtTick,
  noteIdsAtTickForPart,
  noteIdsInRange,
} from '../lib/arranging/selectNotesAtTick'
import type { TagRollProject } from '../lib/tagRoll/types'

export type CoachFocusStore = {
  selectNotes: (ids: string[]) => void
  setPlayheadTick: (tick: number, opts?: { snap?: boolean }) => void
}

export type ChordCursorHighlight = {
  startTick: number
  endTick: number
}

export function useTagRollCoachFocus(
  getProject: () => TagRollProject | null | undefined,
  store: CoachFocusStore,
) {
  /** User inspect range from ruler drag-select; null while coaching / after click-away. */
  const chordCursor = ref<ChordCursorHighlight | null>(null)

  function clearChordCursor(): void {
    chordCursor.value = null
  }

  /** Ruler drag-select / edge resize — shows L/R lines and selects notes in range. */
  function setChordCursor(range: ChordCursorHighlight): void {
    const p = getProject()
    if (!p) return
    const start = Math.max(0, Math.round(range.startTick))
    const end = Math.max(start + 1, Math.round(range.endTick))
    chordCursor.value = { startTick: start, endTick: end }
    store.selectNotes(noteIdsInRange(p, start, end))
    store.setPlayheadTick(start, { snap: false })
  }

  function onCoachFocusTick(tick: number): void {
    const p = getProject()
    if (!p) return
    clearChordCursor()
    store.selectNotes(noteIdsAtTick(p, tick))
    store.setPlayheadTick(tick, { snap: false })
  }

  function onCoachFocusRange(start: number, end: number): void {
    const p = getProject()
    if (!p) return
    clearChordCursor()
    store.selectNotes(noteIdsInRange(p, start, end))
    store.setPlayheadTick(start, { snap: false })
  }

  function onCoachFocusPart(tick: number, partName: string): void {
    const p = getProject()
    if (!p) return
    clearChordCursor()
    store.selectNotes(noteIdsAtTickForPart(p, tick, partName))
    store.setPlayheadTick(tick, { snap: false })
  }

  return {
    chordCursor,
    clearChordCursor,
    setChordCursor,
    onCoachFocusTick,
    onCoachFocusRange,
    onCoachFocusPart,
  }
}
