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
 * Pin paths call `scrollTo(0)` and suppress disarm for ~100ms. Fast user scrolls
 * during that window used to be ignored while later pin timeouts still yanked to
 * top — so note mid-list scroll even inside the suppress window when pin is armed.
 * Pure restore (pin not armed) still respects suppress so programmatic mid-list
 * positioning does not look like user intent.
 */
export function shouldNoteUserBrowseScroll(opts: {
  userTookScroll: boolean
  scrollY: number
  docTopEps: number
  suppressUntil: number
  /** True while auto pin-to-search-top is still armed. */
  pinArmed: boolean
  now?: number
}): boolean {
  if (opts.userTookScroll) return false
  if (opts.scrollY <= opts.docTopEps) return false
  const now = opts.now ?? Date.now()
  if (opts.pinArmed) return true
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
