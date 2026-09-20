export const PAGE_SWIPE_MIN_PX = 56

export type ActivePointer = { id: number; x: number; y: number }

export function pointerDistance(pointers: Iterable<ActivePointer>): number {
  const pts = [...pointers]
  if (pts.length < 2) return 0
  const a = pts[0]!
  const b = pts[1]!
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function pointerMidpointClient(pointers: Iterable<ActivePointer>): {
  x: number
  y: number
} {
  const pts = [...pointers]
  if (pts.length < 2) return { x: 0, y: 0 }
  const a = pts[0]!
  const b = pts[1]!
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export function isChromeTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return !!(el?.closest?.('.chrome') || el?.closest?.('.sheet-piano-dock'))
}

/** Map visual (client) px → layout px for the sheet viewport under html zoom. */
export function layoutScaleFromViewport(el: HTMLElement): {
  sx: number
  sy: number
  rect: DOMRect
} {
  const rect = el.getBoundingClientRect()
  return {
    sx: rect.width > 0 ? el.clientWidth / rect.width : 1,
    sy: rect.height > 0 ? el.clientHeight / rect.height : 1,
    rect,
  }
}

export function viewportPointFromClient(
  el: HTMLElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const { sx, sy, rect } = layoutScaleFromViewport(el)
  return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy }
}

/** At (or near) session fit, horizontal swipe turns pages instead of only panning. */
export function shouldTriggerPageSwipe(input: {
  fsScrollMode: boolean
  pageCount: number
  scale: number
  fitScale: number
  gesturePanX: number
  gesturePanY: number
}): boolean {
  if (input.fsScrollMode) return false
  if (input.pageCount <= 1) return false
  if (input.scale > input.fitScale * 1.08) return false
  const ax = Math.abs(input.gesturePanX)
  const ay = Math.abs(input.gesturePanY)
  if (ax < PAGE_SWIPE_MIN_PX || ax < ay * 1.15) return false
  return true
}

export function pageSwipeDelta(gesturePanX: number): number {
  return gesturePanX < 0 ? 1 : -1
}
