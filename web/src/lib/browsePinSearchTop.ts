/**
 * Fresh Browse opens pin document scroll at search-top while the jump rail /
 * virtualizer settle. Once the user scrolls into the list, pinning must stop
 * — otherwise first-paint→full catalog / catalog.load() / lyrics settle yank
 * them back to y=0.
 */

export type BrowseScrollIntentLike = 'top' | 'restore' | null

export function shouldDisarmPinSearchTop(opts: {
  pinArmed: boolean
  scrollY: number
  /** Pixels — treat ≤ this as still at search top. */
  docTopEps: number
  /** Ignore scroll events through this timestamp (programmatic pin/restore). */
  suppressUntil: number
  now?: number
}): boolean {
  const now = opts.now ?? Date.now()
  if (!opts.pinArmed) return false
  if (now < opts.suppressUntil) return false
  return opts.scrollY > opts.docTopEps
}

/**
 * Whether a `scroll` event should sticky-mark “user took over”.
 *
 * Always respect {@link suppressUntil}: programmatic pin/`scrollTo` and row-height
 * settle (lyrics pack / virtualizer remasure) synthesize `scroll` without a real
 * gesture. Fast user scrolls during suppress are caught by wheel/touchmove via
 * {@link shouldNoteUserBrowseScrollGesture}.
 */
export function shouldNoteUserBrowseScroll(opts: {
  userTookScroll: boolean
  scrollY: number
  docTopEps: number
  suppressUntil: number
  /** Kept for call-site compatibility; no longer bypasses suppress. */
  pinArmed?: boolean
  now?: number
}): boolean {
  if (opts.userTookScroll) return false
  if (opts.scrollY <= opts.docTopEps) return false
  const now = opts.now ?? Date.now()
  return now >= opts.suppressUntil
}

/**
 * Wheel / touchmove are never synthesized by `scrollTo` — always user intent.
 * Ignore while search-top is still settling so pull-to-refresh finger-up does
 * not mark “user took scroll” and leave mid-list chrome painted.
 */
export function shouldNoteUserBrowseScrollGesture(opts: {
  userTookScroll: boolean
  /** True while Browse is still settling to search-top (before list fade-in). */
  searchTopPending?: boolean
}): boolean {
  if (opts.userTookScroll) return false
  if (opts.searchTopPending) return false
  return true
}

/**
 * Arm / re-arm search-top pin regardless of current scrollY.
 * Use for the initial mount pin so a browser-restored mid offset can still be yanked home.
 */
export function mayArmPinSearchTop(opts: {
  restoring: boolean
  userTookScroll: boolean
}): boolean {
  return !opts.restoring && !opts.userTookScroll
}

/**
 * Whether auto “search top” positioning may still run after settle.
 * Once the user has scrolled the list (or scrollY is already mid-list), stop.
 */
export function mayAutoPinSearchTop(opts: {
  restoring: boolean
  userTookScroll: boolean
  scrollY: number
  docTopEps: number
}): boolean {
  if (!mayArmPinSearchTop(opts)) return false
  return opts.scrollY <= opts.docTopEps
}

/**
 * Hide sticky mid-list chrome (results meta + jump rail) until search-top settles.
 * Mid-restore keeps that chrome visible on purpose.
 */
export function isSearchTopPending(opts: {
  browseReveal: boolean
  restoringAtTag: boolean
  scrollIntent: BrowseScrollIntentLike
}): boolean {
  if (opts.browseReveal) return false
  if (opts.restoringAtTag) return false
  if (opts.scrollIntent === 'restore') return false
  return true
}

/**
 * Block TanStack Virtual `applyScrollAdjustment` / scrollToFn while pinning search-top.
 * Cold load measures rows above the fold and can cascade window.scrollY to thousands
 * of px (jump-rail flash) before pin-to-top runs.
 */
export function shouldBlockVirtualizerScrollAdjust(opts: {
  pinArmed: boolean
  searchTopPending: boolean
}): boolean {
  return opts.pinArmed || opts.searchTopPending
}

/** @deprecated Prefer {@link mayAutoPinSearchTop}. */
export function shouldRepinAfterCatalogUpgrade(opts: {
  restoring: boolean
  scrollY: number
  docTopEps: number
  userTookScroll?: boolean
}): boolean {
  return mayAutoPinSearchTop({
    restoring: opts.restoring,
    userTookScroll: opts.userTookScroll ?? false,
    scrollY: opts.scrollY,
    docTopEps: opts.docTopEps,
  })
}
