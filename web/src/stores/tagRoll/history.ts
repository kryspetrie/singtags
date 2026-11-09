/** Undo, redo, and debounced history persistence for Tag Studio. */

import { lazyFn, type StoreDeps } from './deps'

import { persistTagRollHistory } from '../../application/tagRoll/persist'

import {
  applyDocumentSnapshot,
  captureDocumentSnapshot,
  pushUndoStack,
} from '../../lib/tagRoll/history'

import { svc } from './runtime'

export function createTagRollHistoryActions(deps: StoreDeps) {

  const clearNoteSelection = lazyFn(() => deps.clearNoteSelection)
  const current = deps.current
  const redoStack = deps.redoStack
  const scheduleSave = lazyFn(() => deps.scheduleSave)
  const selectedExpressionId = deps.selectedExpressionId
  const slots = deps.slots
  const undoStack = deps.undoStack

  let historySuspended = false

  function scheduleHistoryPersist(): void {
    const p = current.value
    if (!p) return
    if (slots.historyTimer) clearTimeout(slots.historyTimer)
    slots.historyTimer = setTimeout(() => {
      slots.historyTimer = null
      void persistTagRollHistory(
        svc().repository,
        {
          projectId: p.id,
          undo: undoStack.value,
          redo: redoStack.value,
        },
        svc().clock,
      ).catch(() => {
        /* ignore history persist errors */
      })
    }, 350)
  }

  function pushHistory(): void {
    const p = current.value
    if (!p || historySuspended) return
    undoStack.value = pushUndoStack(undoStack.value, captureDocumentSnapshot(p))
    redoStack.value = []
    scheduleHistoryPersist()
  }

  function withHistory(fn: () => void): void {
    pushHistory()
    fn()
  }

  /** History checkpoint for note or expression lane drags. */
  function pushHistoryCheckpoint(): void {
    pushHistory()
  }

  /** @deprecated Prefer pushHistoryCheckpoint */
  function beginNoteGesture(): void {
    pushHistoryCheckpoint()
  }

  function undo(): boolean {
    const p = current.value
    const snap = undoStack.value[undoStack.value.length - 1]
    if (!p || !snap) return false
    const currentSnap = captureDocumentSnapshot(p)
    undoStack.value = undoStack.value.slice(0, -1)
    redoStack.value = [...redoStack.value, currentSnap]
    historySuspended = true
    current.value = applyDocumentSnapshot(p, snap)
    historySuspended = false
    clearNoteSelection()
    selectedExpressionId.value = null
    scheduleSave()
    scheduleHistoryPersist()
    return true
  }

  function redo(): boolean {
    const p = current.value
    const snap = redoStack.value[redoStack.value.length - 1]
    if (!p || !snap) return false
    const currentSnap = captureDocumentSnapshot(p)
    redoStack.value = redoStack.value.slice(0, -1)
    undoStack.value = [...undoStack.value, currentSnap]
    historySuspended = true
    current.value = applyDocumentSnapshot(p, snap)
    historySuspended = false
    clearNoteSelection()
    selectedExpressionId.value = null
    scheduleSave()
    scheduleHistoryPersist()
    return true
  }

  /** Cancel the most recent edit (harmonizer apply, etc.). */
  function cancelLastEdit(): boolean {
    return undo()
  }

  const actions = {
    scheduleHistoryPersist,
    pushHistory,
    withHistory,
    pushHistoryCheckpoint,
    beginNoteGesture,
    undo,
    redo,
    cancelLastEdit,
  }
  Object.assign(deps, actions)

  function bindWatches(): void {}

  return { actions, bindWatches }

}
