/** Note, tie, and selection edits for Tag Studio. */

import { lazyFn, type StoreDeps } from './deps'

import { ensureLengthForNote, snapTick } from '../../lib/tagRoll/snap'

import { applyNoteClipboardAtPlayhead } from '../../lib/tagRoll/pasteClipboard'

import { clipboardFromCopy, clipboardFromCut } from '../../lib/tagRoll/noteClipboardActions'

import {
  tryBoundInspectCopy,
  tryBoundInspectCut,
  tryBoundInspectDelete,
  tryBoundInspectPasteHighlight,
} from '../../lib/tagRoll/chordCursorTransport'

import { measureTicks } from '../../lib/tagRoll/tempoMap'

import type { TagRollNote } from '../../lib/tagRoll/types'

import {
  clearTiesInvolving,
  sanitizeNoteTies,
  tieNotesInList,
  tieSelectionState,
  untieNotesInList,
} from '../../lib/tagRoll/noteTies'

import {
  TAG_ROLL_DEFAULT_SNAP_TICKS,
  TAG_ROLL_MIDI_MAX,
  TAG_ROLL_MIDI_MIN,
} from '../../lib/tagRoll/types'

import { now, svc } from './runtime'

export function createTagRollNoteEditActions(deps: StoreDeps) {

  const addDurationTicks = deps.addDurationTicks
  const chordsLaneFocused = deps.chordsLaneFocused
  const clearSketchSelection = lazyFn(() => deps.clearSketchSelection)
  const current = deps.current
  const deleteSelectedTuplet = lazyFn(() => deps.deleteSelectedTuplet)
  const noteClipboard = deps.noteClipboard
  const patchView = lazyFn(() => deps.patchView)
  const pushHistory = lazyFn(() => deps.pushHistory)
  const scheduleSave = lazyFn(() => deps.scheduleSave)
  const selectedExpressionId = deps.selectedExpressionId
  const selectedNoteIds = deps.selectedNoteIds
  const selectedNotes = deps.selectedNotes
  const selectedTupletId = deps.selectedTupletId

  function clearNoteSelection(): void {
    selectedNoteIds.value = []
  }

  function addNote(partial: {
    midi: number
    startTick: number
    durationTicks?: number
    partId?: string
  }): TagRollNote | null {
    const p = current.value
    if (!p) return null
    const partId = partial.partId ?? p.view.activePartId ?? p.parts[0]?.id
    if (!partId) return null
    pushHistory()
    const snap = p.snapTicks || TAG_ROLL_DEFAULT_SNAP_TICKS
    const startTick = snapTick(partial.startTick, snap)
    const durationTicks = Math.max(
      snap,
      partial.durationTicks ?? addDurationTicks.value,
    )
    const midi = Math.max(TAG_ROLL_MIDI_MIN, Math.min(TAG_ROLL_MIDI_MAX, Math.round(partial.midi)))
    const note: TagRollNote = {
      id: svc().idGen.next('trn'),
      partId,
      midi,
      startTick,
      durationTicks,
    }
    const lengthTicks = ensureLengthForNote(
      p.lengthTicks,
      startTick,
      durationTicks,
      measureTicks(p.timeSignature),
    )
    current.value = {
      ...p,
      notes: [...p.notes, note],
      lengthTicks,
      view: { ...p.view, mode: 'compose' },
      updatedAt: now(),
    }
    selectNote(note.id)
    selectedExpressionId.value = null
    scheduleSave()
    return note
  }

  function updateNote(
    id: string,
    patch: Partial<TagRollNote>,
    opts?: { history?: boolean },
  ): void {
    const p = current.value
    if (!p) return
    if (opts?.history !== false) pushHistory()
    const notes = sanitizeNoteTies(
      p.notes.map((n: any) => {
        if (n.id !== id) return n
        const next = { ...n, ...patch }
        next.midi = Math.max(TAG_ROLL_MIDI_MIN, Math.min(TAG_ROLL_MIDI_MAX, Math.round(next.midi)))
        next.startTick = Math.max(0, Math.round(next.startTick))
        next.durationTicks = Math.max(1, Math.round(next.durationTicks))
        return next
      }),
    )
    const hit = notes.find((n) => n.id === id)
    const lengthTicks = hit
      ? ensureLengthForNote(
          p.lengthTicks,
          hit.startTick,
          hit.durationTicks,
          measureTicks(p.timeSignature),
        )
      : p.lengthTicks
    current.value = { ...p, notes, lengthTicks, updatedAt: now() }
    scheduleSave()
  }

  /** Live drag updates — one history entry should already be pushed at gesture start. */
  function updateNoteLive(id: string, patch: Partial<TagRollNote>): void {
    updateNote(id, patch, { history: false })
  }

  /** Apply several note patches in one write (group drag). */
  function updateNotesLive(
    updates: ReadonlyArray<{ id: string; midi?: number; startTick?: number; durationTicks?: number }>,
  ): void {
    const p = current.value
    if (!p || !updates.length) return
    const byId = new Map(updates.map((u) => [u.id, u]))
    let lengthTicks = p.lengthTicks
    const mTicks = measureTicks(p.timeSignature)
    const notes = sanitizeNoteTies(
      p.notes.map((n: any) => {
        const u = byId.get(n.id)
        if (!u) return n
        const next = { ...n }
        if (u.midi != null) {
          next.midi = Math.max(TAG_ROLL_MIDI_MIN, Math.min(TAG_ROLL_MIDI_MAX, Math.round(u.midi)))
        }
        if (u.startTick != null) next.startTick = Math.max(0, Math.round(u.startTick))
        if (u.durationTicks != null) next.durationTicks = Math.max(1, Math.round(u.durationTicks))
        lengthTicks = ensureLengthForNote(lengthTicks, next.startTick, next.durationTicks, mTicks)
        return next
      }),
    )
    current.value = { ...p, notes, lengthTicks, updatedAt: now() }
    scheduleSave()
  }

  function deleteNote(id: string): void {
    deleteNotes([id])
  }

  function deleteNotes(ids: readonly string[]): void {
    const p = current.value
    if (!p || !ids.length) return
    const remove = new Set(ids)
    pushHistory()
    const notes = sanitizeNoteTies(
      clearTiesInvolving(p.notes, remove).filter((n) => !remove.has(n.id)),
    )
    current.value = {
      ...p,
      notes,
      melodyPasses: (p.melodyPasses ?? []).filter(
        (l: any) => !remove.has(l.fromNoteId) && !remove.has(l.toNoteId),
      ),
      updatedAt: now(),
    }
    selectedNoteIds.value = selectedNoteIds.value.filter((id: any) => !remove.has(id))
    scheduleSave()
  }

  /** Tie two adjacent same-pitch notes (order-insensitive). */
  function tieNotes(aId: string, bId: string): boolean {
    const p = current.value
    if (!p) return false
    const next = tieNotesInList(p.notes, aId, bId)
    if (!next) return false
    pushHistory()
    current.value = { ...p, notes: next, updatedAt: now() }
    scheduleSave()
    return true
  }

  function untieNotes(aId: string, bId: string): boolean {
    const p = current.value
    if (!p) return false
    const state = tieSelectionState(p.notes, [aId, bId])
    if (!state.canUntie) return false
    pushHistory()
    current.value = {
      ...p,
      notes: untieNotesInList(p.notes, aId, bId),
      updatedAt: now(),
    }
    scheduleSave()
    return true
  }

  function tieSelectedNotes(): boolean {
    const ids = selectedNoteIds.value
    if (ids.length !== 2) return false
    return tieNotes(ids[0]!, ids[1]!)
  }

  function untieSelectedNotes(): boolean {
    const ids = selectedNoteIds.value
    if (ids.length !== 2) return false
    return untieNotes(ids[0]!, ids[1]!)
  }

  /** Shift+T: tie if unbound pair, untie if already tied. */
  function toggleTieSelectedNotes(): boolean {
    const p = current.value
    if (!p) return false
    const state = tieSelectionState(p.notes, selectedNoteIds.value)
    if (state.canUntie) return untieSelectedNotes()
    if (state.canTie) return tieSelectedNotes()
    return false
  }
  function deleteSelectedNotes(): void {
    if (tryBoundInspectDelete()) return
    if (selectedTupletId.value) {
      deleteSelectedTuplet()
      return
    }
    if (!selectedNoteIds.value.length) return
    deleteNotes(selectedNoteIds.value)
  }
  function selectNote(
    id: string | null,
    opts?: { additive?: boolean },
  ): void {
    if (id == null) {
      clearNoteSelection()
      return
    }
    chordsLaneFocused.value = false
    clearSketchSelection()
    selectedTupletId.value = null
    if (opts?.additive) {
      if (selectedNoteIds.value.includes(id)) {
        selectedNoteIds.value = selectedNoteIds.value.filter((x: any) => x !== id)
      } else {
        selectedNoteIds.value = [...selectedNoteIds.value, id]
      }
    } else {
      selectedNoteIds.value = [id]
    }
    selectedExpressionId.value = null
    const p = current.value
    if (!p) return
    if (p.view.mode === 'view') {
      patchView({ mode: 'compose' })
      return
    }
    // Lyrics: clicking a note adopts that part so the lyric strip follows.
    if (p.view.mode === 'lyrics') {
      const note = p.notes.find((n: any) => n.id === id)
      if (note && note.partId !== p.view.activePartId) {
        patchView({ activePartId: note.partId })
      }
    }
  }

  function selectNotes(ids: readonly string[], opts?: { additive?: boolean }): void {
    const unique = [...new Set(ids)]
    if (unique.length) {
      chordsLaneFocused.value = false
      clearSketchSelection()
    }
    if (opts?.additive && selectedNoteIds.value.length) {
      const set = new Set(selectedNoteIds.value)
      for (const id of unique) set.add(id)
      selectedNoteIds.value = [...set]
    } else {
      selectedNoteIds.value = unique
    }
    if (unique.length) {
      selectedExpressionId.value = null
      if (current.value && current.value.view.mode === 'view') {
        patchView({ mode: 'compose' })
      }
    }
  }

  function copySelectedNotes(): boolean {
    const clip = clipboardFromCopy(tryBoundInspectCopy, selectedNotes.value)
    if (!clip) return false
    noteClipboard.value = clip
    return true
  }
  function cutSelectedNotes(): boolean {
    const hit = clipboardFromCut(tryBoundInspectCut, selectedNotes.value)
    if (!hit) return false
    noteClipboard.value = hit.clip
    if (hit.removeIds.length) deleteNotes(hit.removeIds)
    return true
  }
  function pasteNotesAtPlayhead(): boolean {
    const p = current.value
    const clip = noteClipboard.value
    if (!p || !clip) return false
    const applied = applyNoteClipboardAtPlayhead(p, clip, () => svc().idGen.next('trn'))
    if (!applied) return false
    pushHistory()
    current.value = { ...applied.project, updatedAt: now() }
    selectedNoteIds.value = applied.createdIds
    selectedExpressionId.value = null
    if (applied.spanTicks != null) {
      tryBoundInspectPasteHighlight(applied.origin, applied.origin + applied.spanTicks)
    }
    scheduleSave()
    return true
  }

  const actions = {
    clearNoteSelection,
    addNote,
    updateNote,
    updateNoteLive,
    updateNotesLive,
    deleteNote,
    deleteNotes,
    tieNotes,
    untieNotes,
    tieSelectedNotes,
    untieSelectedNotes,
    toggleTieSelectedNotes,
    deleteSelectedNotes,
    selectNote,
    selectNotes,
    copySelectedNotes,
    cutSelectedNotes,
    pasteNotesAtPlayhead,
  }
  Object.assign(deps, actions)

  function bindWatches(): void {}

  return { actions, bindWatches }

}
