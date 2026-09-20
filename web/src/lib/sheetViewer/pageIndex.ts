export type PageBox = { offsetTop: number; offsetHeight: number }

/** Keep the page indicator in sync while panning the scroll stack. */
export function pageIndexFromContentMidpoint(
  pages: PageBox[],
  viewMidContentY: number,
): number {
  if (pages.length <= 1) return 0
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < pages.length; i++) {
    const el = pages[i]!
    const mid = el.offsetTop + el.offsetHeight / 2
    const d = Math.abs(mid - viewMidContentY)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}

export function viewMidContentY(
  sheetClientHeight: number,
  panY: number,
  scale: number,
): number {
  if (scale <= 0) return 0
  return (sheetClientHeight / 2 - panY) / scale
}

export function clampPageIndex(pageIndex: number, pageCount: number): number {
  if (pageCount <= 0) return 0
  return Math.max(0, Math.min(pageCount - 1, pageIndex))
}

export function nextPageIndex(pageIndex: number, delta: number, pageCount: number): number {
  return clampPageIndex(pageIndex + delta, pageCount)
}

export function panYForPageTop(
  pageOffsetTop: number,
  scale: number,
  topInset: number,
): number {
  const s = scale > 0 ? scale : 1
  return Math.max(0, topInset) - pageOffsetTop * s
}

export function resetPageIndexOnPagesChange(
  pageIndex: number,
  prevCount: number | undefined,
  pageCount: number,
): number {
  if (prevCount == null || pageCount !== prevCount) return 0
  return clampPageIndex(pageIndex, pageCount)
}
