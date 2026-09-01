import { computed, nextTick, onUnmounted, ref, watch, type Ref } from 'vue'

/** Count how many flex-wrapped children fit within `maxRows` rows. */
export function countItemsWithinRows(container: HTMLElement, maxRows: number): number {
  const children = Array.from(container.children) as HTMLElement[]
  if (!children.length) return 0
  const tops = new Set<number>()
  for (let i = 0; i < children.length; i++) {
    tops.add(children[i]!.offsetTop)
    if (tops.size > maxRows) return Math.max(1, i)
  }
  return children.length
}

/** Row count used by the first `itemCount` flex-wrapped children. */
export function countRowsUsed(container: HTMLElement, itemCount: number): number {
  const children = Array.from(container.children) as HTMLElement[]
  const tops = new Set<number>()
  for (let i = 0; i < Math.min(itemCount, children.length); i++) {
    tops.add(children[i]!.offsetTop)
  }
  return Math.max(1, tops.size)
}

/**
 * Page a pill strip only when items overflow `maxRows` at the current width.
 * Renders a hidden measure layer; visible items slice to what fits per page.
 */
export function useTwoRowStripPaging<T>(
  items: Ref<readonly T[]>,
  options?: {
    maxRows?: number
    hostEl?: Ref<HTMLElement | null>
    measureEl?: Ref<HTMLElement | null>
  },
) {
  const maxRows = options?.maxRows ?? 2
  const measureEl = options?.measureEl ?? ref<HTMLElement | null>(null)
  const hostEl = options?.hostEl ?? ref<HTMLElement | null>(null)
  const page = ref(0)
  const fitCount = ref(0)
  const needsPager = ref(false)
  const stripRows = ref(1)

  async function syncFitCount(): Promise<void> {
    await nextTick()
    const measure = measureEl.value
    const host = hostEl.value
    const total = items.value.length

    if (!measure || !host || total === 0) {
      needsPager.value = false
      fitCount.value = total
      stripRows.value = 1
      return
    }

    // Phase 1: full strip width (no side chevrons).
    needsPager.value = false
    await nextTick()
    measure.style.width = `${host.clientWidth}px`
    let fit = countItemsWithinRows(measure, maxRows)

    if (total <= fit) {
      fitCount.value = fit
      needsPager.value = false
      stripRows.value = countRowsUsed(measure, total)
      return
    }

    // Phase 2: enable chevron columns, re-measure the narrower pill area.
    needsPager.value = true
    await nextTick()
    measure.style.width = `${host.clientWidth}px`
    fit = Math.max(1, countItemsWithinRows(measure, maxRows))
    fitCount.value = fit
    stripRows.value = maxRows
    return
  }

  let ro: ResizeObserver | null = null

  function attachObserver(): void {
    ro?.disconnect()
    if (typeof ResizeObserver === 'undefined') return
    ro = new ResizeObserver(() => {
      void syncFitCount()
    })
    if (hostEl.value) ro.observe(hostEl.value)
  }

  watch(items, () => {
    page.value = 0
    void syncFitCount()
  })

  watch([measureEl, hostEl], () => {
    attachObserver()
    void syncFitCount()
  })

  onUnmounted(() => {
    ro?.disconnect()
    ro = null
  })

  const showPager = computed(() => needsPager.value)
  const pageCount = computed(() =>
    Math.max(1, Math.ceil(items.value.length / Math.max(1, fitCount.value))),
  )
  const pagedItems = computed(() => {
    if (!needsPager.value || fitCount.value <= 0) return items.value
    const start = page.value * fitCount.value
    return items.value.slice(start, start + fitCount.value)
  })

  watch(pageCount, (n) => {
    if (page.value > n - 1) page.value = Math.max(0, n - 1)
  })

  function pageForIndex(index: number): number {
    if (!needsPager.value || fitCount.value <= 0) return 0
    return Math.floor(index / fitCount.value)
  }

  return {
    measureEl,
    hostEl,
    page,
    fitCount,
    showPager,
    pageCount,
    pagedItems,
    stripRows,
    syncFitCount,
    pageForIndex,
  }
}
