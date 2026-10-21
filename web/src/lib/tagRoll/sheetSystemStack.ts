/**
 * Vertical packing of wrapped sheet systems — gaps grow for chord clearance
 * and systems spill to new pages when the page budget is exceeded.
 */

export type SheetSystemStackPlace = {
  systemIndex: number
  pageIndex: number
  y: number
}

export type SheetSystemStackOpts = {
  /** Height of one system row (staves + lyrics), same units as clearances. */
  systemBodyHeight: number
  /** Minimum gap between systems when chords need little/no room. */
  baseSystemGap: number
  /** Per-system px above the staff top reserved for chord marks. */
  chordClearanceBySystem: readonly number[]
  /**
   * Expression / top pad already reserved above the first system on a page.
   * Chord clearance beyond this adds extra top inset.
   */
  existingTopHeadroom: number
  pageMode: boolean
  /** Usable height for systems on page `pi` (excludes title band / margins). */
  pageSystemBudget: (pageIndex: number) => number
  /** Absolute canvas Y of the top content band on page `pi`. */
  pageContentTopY: (pageIndex: number) => number
  /** Continuous-mode Y where the first system would start (before chord extra). */
  continuousOriginY: number
}

/**
 * Assign `pageIndex` + `y` for each unique system, then stamp onto places.
 * Mutates `places` in systemIndex order.
 */
export function stackSheetSystems<T extends SheetSystemStackPlace>(
  places: T[],
  opts: SheetSystemStackOpts,
): void {
  if (!places.length) return
  const systemCount =
    Math.max(...places.map((p) => p.systemIndex), 0) + 1
  const clearance = (si: number) =>
    Math.max(0, opts.chordClearanceBySystem[si] ?? 0)

  const firstExtra = (si: number) =>
    Math.max(0, clearance(si) - opts.existingTopHeadroom)

  const gapBefore = (si: number) =>
    Math.max(opts.baseSystemGap, clearance(si))

  const systemPage = Array.from({ length: systemCount }, () => 0)
  if (opts.pageMode) {
    let pageIndex = 0
    let usedH = 0
    let countOnPage = 0
    for (let si = 0; si < systemCount; si++) {
      const asFirst = countOnPage === 0
      const addH = asFirst
        ? firstExtra(si) + opts.systemBodyHeight
        : gapBefore(si) + opts.systemBodyHeight
      if (!asFirst && usedH + addH > opts.pageSystemBudget(pageIndex)) {
        pageIndex += 1
        usedH = firstExtra(si) + opts.systemBodyHeight
        countOnPage = 1
      } else {
        usedH += addH
        countOnPage += 1
      }
      systemPage[si] = pageIndex
    }
  }

  for (const pl of places) {
    pl.pageIndex = systemPage[pl.systemIndex] ?? 0
  }

  let yCursor =
    (opts.pageMode
      ? opts.pageContentTopY(0)
      : opts.continuousOriginY) + firstExtra(0)
  let prevSi = -1
  let prevPage = 0
  for (const pl of places) {
    if (pl.systemIndex !== prevSi) {
      if (prevSi >= 0) {
        if (pl.pageIndex !== prevPage) {
          yCursor =
            opts.pageContentTopY(pl.pageIndex) + firstExtra(pl.systemIndex)
        } else {
          yCursor += opts.systemBodyHeight + gapBefore(pl.systemIndex)
        }
      }
      prevSi = pl.systemIndex
      prevPage = pl.pageIndex
    }
    pl.y = yCursor
  }
}
