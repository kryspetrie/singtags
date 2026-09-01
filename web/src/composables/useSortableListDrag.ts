/**
 * Pointer drag-to-reorder for vertical lists (Favorites rows, collection manage rows).
 */
import { computed, onUnmounted, ref } from 'vue'

const DRAG_HOLD_MS = 280

export type SortableDragEdge = 'before' | 'after'

export function useSortableListDrag<TId extends string | number>(options: {
  /** CSS selector for draggable row elements (must have `data-index`). */
  rowSelector: string
  onReorder: (id: TId, toIndex: number) => void
}) {
  const draggingId = ref<TId | null>(null)
  const dragOverIndex = ref<number | null>(null)
  const dragOverEdge = ref<SortableDragEdge | null>(null)
  const dragFromIndex = ref(-1)
  const dragActive = ref(false)

  let holdTimer: ReturnType<typeof setTimeout> | null = null
  let holdPointerId: number | null = null
  let holdStartY = 0

  const finePointer = computed(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches,
  )

  function clearHoldTimer(): void {
    if (holdTimer) {
      clearTimeout(holdTimer)
      holdTimer = null
    }
  }

  function stopDragListeners(): void {
    window.removeEventListener('pointermove', onHoldMove)
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)
    window.removeEventListener('pointercancel', onDragEnd)
  }

  function beginDrag(id: TId, index: number, pointerId: number, handle: HTMLElement): void {
    dragActive.value = true
    draggingId.value = id
    dragFromIndex.value = index
    dragOverIndex.value = index
    dragOverEdge.value = null
    handle.setPointerCapture(pointerId)
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragEnd)
    window.addEventListener('pointercancel', onDragEnd)
  }

  function onHandlePointerDown(e: PointerEvent, id: TId, index: number): void {
    if (dragActive.value) return
    const handle = e.currentTarget as HTMLElement
    holdPointerId = e.pointerId
    holdStartY = e.clientY

    const start = (): void => {
      clearHoldTimer()
      window.removeEventListener('pointermove', onHoldMove)
      window.removeEventListener('pointerup', cancelHold)
      window.removeEventListener('pointercancel', cancelHold)
      if (holdPointerId !== e.pointerId) return
      beginDrag(id, index, e.pointerId, handle)
    }

    if (finePointer.value) {
      e.preventDefault()
      start()
      return
    }

    window.addEventListener('pointermove', onHoldMove)
    window.addEventListener('pointerup', cancelHold)
    window.addEventListener('pointercancel', cancelHold)
    holdTimer = setTimeout(start, DRAG_HOLD_MS)
  }

  function onHoldMove(e: PointerEvent): void {
    if (holdPointerId !== e.pointerId) return
    if (Math.abs(e.clientY - holdStartY) > 8) cancelHold()
  }

  function cancelHold(): void {
    clearHoldTimer()
    holdPointerId = null
    window.removeEventListener('pointermove', onHoldMove)
    window.removeEventListener('pointerup', cancelHold)
    window.removeEventListener('pointercancel', cancelHold)
  }

  function setDropTarget(row: HTMLElement, clientY: number): void {
    const index = Number(row.dataset.index)
    if (!Number.isFinite(index)) return
    if (index === dragFromIndex.value) {
      dragOverIndex.value = index
      dragOverEdge.value = null
      return
    }
    const rect = row.getBoundingClientRect()
    const edge: SortableDragEdge = clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    dragOverIndex.value = index
    dragOverEdge.value = edge
  }

  function insertIndexForDrop(): number | null {
    const over = dragOverIndex.value
    const edge = dragOverEdge.value
    const from = dragFromIndex.value
    if (over == null || edge == null || from < 0) return null
    let insertAt = edge === 'after' ? over + 1 : over
    if (from < insertAt) insertAt--
    return insertAt
  }

  function onDragMove(e: PointerEvent): void {
    if (!dragActive.value) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const row = el?.closest<HTMLElement>(options.rowSelector)
    if (!row) return
    setDropTarget(row, e.clientY)
  }

  function onDragEnter(e: PointerEvent, index: number): void {
    if (!dragActive.value) return
    const row = e.currentTarget as HTMLElement
    if (Number(row.dataset.index) !== index) return
    setDropTarget(row, e.clientY)
  }

  function onDragEnd(): void {
    clearHoldTimer()
    window.removeEventListener('pointermove', onHoldMove)
    if (dragActive.value && draggingId.value != null) {
      const toIndex = insertIndexForDrop()
      if (toIndex != null) options.onReorder(draggingId.value, toIndex)
    }
    dragActive.value = false
    draggingId.value = null
    dragFromIndex.value = -1
    dragOverIndex.value = null
    dragOverEdge.value = null
    holdPointerId = null
    stopDragListeners()
  }

  function rowDragClass(id: TId, index: number): Record<string, boolean> {
    return {
      dragging: dragActive.value && draggingId.value === id,
      'drop-before':
        dragActive.value &&
        dragOverIndex.value === index &&
        dragOverEdge.value === 'before' &&
        draggingId.value !== id,
      'drop-after':
        dragActive.value &&
        dragOverIndex.value === index &&
        dragOverEdge.value === 'after' &&
        draggingId.value !== id,
    }
  }

  onUnmounted(() => {
    clearHoldTimer()
    stopDragListeners()
  })

  return {
    dragActive,
    draggingId,
    onHandlePointerDown,
    onDragEnter,
    rowDragClass,
    listDraggingClass: computed(() => ({ 'list-dragging': dragActive.value })),
  }
}
