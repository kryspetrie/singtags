/**
 * Fresh Browse opens pin document scroll at search-top while the jump rail /
 * virtualizer settle. Once the user scrolls into the list, pinning must stop
 * — otherwise first-paint→full catalog / catalog.load() / lyrics settle yank
 * them back to y=0.
 */

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
 */
export function shouldNoteUserBrowseScrollGesture(opts: {
  userTookScroll: boolean
}): boolean {
  return !opts.userTookScroll
}

/**
 * Whether auto “search top” positioning may still run.
 * Once the user has scrolled the list (or scrollY is already mid-list), stop.
 */
export function mayAutoPinSearchTop(opts: {
  restoring: boolean
  userTookScroll: boolean
  scrollY: number
  docTopEps: number
}): boolean {
  if (opts.restoring) return false
  if (opts.userTookScroll) return false
  return opts.scrollY <= opts.docTopEps
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
