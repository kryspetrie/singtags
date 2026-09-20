/**
 * Narrow-viewport long-press multi-select for list rows (Sing Together pattern).
 */
import { computed, onUnmounted, ref, type Ref } from 'vue'

export const DEFAULT_NARROW_SELECT_MQ = '(max-width: 639px)'
export const DEFAULT_LONG_PRESS_MS = 450
export const DEFAULT_LONG_PRESS_MOVE_PX = 10

export const DEFAULT_LONG_PRESS_IGNORE_SELECTOR =
  '.sel-btn, .row-remove, .row-open, .song-edit, .drag-handle, a, input, select, textarea, button'

export type LongPressSelectOptions = {
  narrowMq?: string
  longPressMs?: number
  longPressMovePx?: number
  /** Elements that should not start a long-press (CSS selector for closest). */
  ignoreSelector?: string
  /**
   * When true (default), long-press always toggles the id.
   * When false, only selects if not already selected (Favorites / Recent pattern).
   */
  toggleOnLongPress?: boolean
  /** Auto-bind matchMedia + cleanup on unmount (default true). */
  autoBindMedia?: boolean
}

export function useLongPressSelect<TId extends string | number>(
  options: LongPressSelectOptions = {},
) {
  const narrowMqQuery = options.narrowMq ?? DEFAULT_NARROW_SELECT_MQ
  const longPressMs = options.longPressMs ?? DEFAULT_LONG_PRESS_MS
  const longPressMovePx = options.longPressMovePx ?? DEFAULT_LONG_PRESS_MOVE_PX
  const ignoreSelector = options.ignoreSelector ?? DEFAULT_LONG_PRESS_IGNORE_SELECTOR
  const toggleOnLongPress = options.toggleOnLongPress !== false
  const autoBindMedia = options.autoBindMedia !== false

  const selectedIds = ref(new Set<TId>()) as Ref<Set<TId>>
  const selectMode = ref(false)
  const isNarrow = ref(false)

  let narrowMq: MediaQueryList | null = null
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let longPressId: TId | null = null
  let longPressX = 0
  let longPressY = 0
  let suppressRowClick = false

  const showRowSelect = computed(
    () => selectMode.value || selectedIds.value.size > 0 || !isNarrow.value,
  )

  function syncNarrowSelect(): void {
    isNarrow.value = narrowMq?.matches ?? false
  }

  function bindNarrowMediaQuery(): void {
    if (typeof window === 'undefined') return
    unbindNarrowMediaQuery()
    narrowMq = window.matchMedia(narrowMqQuery)
    syncNarrowSelect()
    narrowMq.addEventListener('change', syncNarrowSelect)
  }

  function unbindNarrowMediaQuery(): void {
    narrowMq?.removeEventListener('change', syncNarrowSelect)
    narrowMq = null
  }

  function clearSelection(): void {
    selectedIds.value = new Set()
    selectMode.value = false
  }

  function toggleSelect(id: TId): void {
    const next = new Set(selectedIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedIds.value = next
  }

  function cancelLongPress(): void {
    if (longPressTimer != null) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
    longPressId = null
  }

  function onRowPointerDown(e: PointerEvent, id: TId): void {
    if (!isNarrow.value || showRowSelect.value) return
    const t = e.target as HTMLElement | null
    if (ignoreSelector && t?.closest(ignoreSelector)) return
    longPressId = id
    longPressX = e.clientX
    longPressY = e.clientY
    if (longPressTimer != null) clearTimeout(longPressTimer)
    longPressTimer = setTimeout(() => {
      longPressTimer = null
      if (longPressId !== id) return
      selectMode.value = true
      if (toggleOnLongPress || !selectedIds.value.has(id)) {
        toggleSelect(id)
      }
      suppressRowClick = true
      try {
        navigator.vibrate?.(10)
      } catch {
        /* ignore */
      }
    }, longPressMs)
  }

  function onRowPointerMove(e: PointerEvent): void {
    if (longPressTimer == null) return
    const dx = e.clientX - longPressX
    const dy = e.clientY - longPressY
    if (dx * dx + dy * dy > longPressMovePx * longPressMovePx) {
      clearTimeout(longPressTimer)
      longPressTimer = null
      longPressId = null
    }
  }

  function onRowPointerEnd(): void {
    cancelLongPress()
  }

  function onRowClickCapture(e: MouseEvent): void {
    if (!suppressRowClick) return
    e.preventDefault()
    e.stopPropagation()
    suppressRowClick = false
  }

  /** Drop ids that are no longer in the live set; exit select mode if empty. */
  function pruneSelection(aliveIds: Iterable<TId>): void {
    const alive = new Set(aliveIds)
    const next = new Set([...selectedIds.value].filter((id) => alive.has(id)))
    if (next.size !== selectedIds.value.size) selectedIds.value = next
    if (next.size === 0) selectMode.value = false
  }

  if (autoBindMedia && typeof window !== 'undefined') {
    bindNarrowMediaQuery()
    onUnmounted(() => {
      unbindNarrowMediaQuery()
      cancelLongPress()
    })
  }

  return {
    selectedIds,
    selectMode,
    isNarrow,
    showRowSelect,
    clearSelection,
    toggleSelect,
    onRowPointerDown,
    onRowPointerMove,
    onRowPointerEnd,
    onRowClickCapture,
    bindNarrowMediaQuery,
    unbindNarrowMediaQuery,
    cancelLongPress,
    pruneSelection,
    syncNarrowSelect,
  }
}
