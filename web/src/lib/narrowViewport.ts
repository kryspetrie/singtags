/**
 * Shared narrow-viewport media query for long-press select / compact labels.
 *
 * `index.html` stamps `html[data-narrow]` before paint so Browse does not flash
 * desktop checkboxes / full “100 Days: 100 Tags” chips on phones.
 */

export const NARROW_VIEWPORT_MQ = '(max-width: 639px)'

/** `document.documentElement.dataset.narrow` values. */
export type NarrowViewportFlag = '1' | '0'

function readNarrowDataset(): NarrowViewportFlag | null {
  if (typeof document === 'undefined') return null
  const raw = document.documentElement.dataset.narrow
  return raw === '1' || raw === '0' ? raw : null
}

function matchNarrowMedia(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true
  }
  try {
    return window.matchMedia(NARROW_VIEWPORT_MQ).matches
  } catch {
    return true
  }
}

/** Write {@link NARROW_VIEWPORT_MQ} into `html[data-narrow]` for CSS + first paint. */
export function syncNarrowViewportDataset(matches?: boolean): NarrowViewportFlag {
  const isNarrow = matches ?? matchNarrowMedia()
  const next: NarrowViewportFlag = isNarrow ? '1' : '0'
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.narrow = next
  }
  return next
}

/**
 * True when the viewport currently matches {@link NARROW_VIEWPORT_MQ}.
 * Prefers the early `data-narrow` stamp; falls back to matchMedia; unknown → narrow
 * (mobile-first) so phones never flash desktop select chrome.
 */
export function readIsNarrowViewport(): boolean {
  const stamped = readNarrowDataset()
  if (stamped === '1') return true
  if (stamped === '0') return false
  return matchNarrowMedia()
}
