/**
 * Shared overlay shell helpers: scroll lock, inert app chrome, soft-FS history sentinel.
 */

const SHELL_INERT_SELECTORS = [
  'header.app-header, header',
  'nav.bottom',
  '.toast',
  '.offline-banner',
] as const

const HISTORY_FLAG = 'singFs'

/** Lock document scroll while a fullscreen overlay is open. */
export function setScrollLock(on: boolean): void {
  if (typeof document === 'undefined') return
  const v = on ? 'hidden' : ''
  document.documentElement.style.overflow = v
  document.body.style.overflow = v
}

/** Mark app chrome inert so focus stays in the overlay. */
export function setShellInert(on: boolean): void {
  if (typeof document === 'undefined') return
  for (const sel of SHELL_INERT_SELECTORS) {
    document.querySelectorAll(sel).forEach((el) => {
      if (on) el.setAttribute('inert', '')
      else el.removeAttribute('inert')
    })
  }
}

/**
 * Soft-fullscreen history sentinel so OS back exits the overlay once before leaving the tag.
 * One instance per overlay component (sheet, tracks player, …).
 */
export class OverlayHistorySentinel {
  private pushed = false
  private ignorePop = false
  private pendingResolve: (() => void) | null = null

  push(): void {
    if (typeof history === 'undefined' || this.pushed) return
    if (import.meta.env.MODE === 'test') return
    try {
      const prev =
        history.state && typeof history.state === 'object'
          ? (history.state as Record<string, unknown>)
          : {}
      history.pushState({ ...prev, [HISTORY_FLAG]: true }, '')
      this.pushed = true
    } catch {
      /* ignore */
    }
  }

  /** Drop the sentinel without history.back() (avoids Vue Router pop races). */
  discard(): void {
    if (!this.pushed) return
    this.pushed = false
    if (typeof history === 'undefined') return
    try {
      const st = history.state as Record<string, unknown> | null
      if (st && st[HISTORY_FLAG]) {
        const next = { ...st }
        delete next[HISTORY_FLAG]
        history.replaceState(next, '')
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Pop the sentinel via history.back(); resolves after popstate (or immediately).
   * Prefer {@link discard} when closing overlays programmatically — Vue Router
   * often treats the resulting popstate as leaving the current tag page.
   */
  clear(): Promise<void> {
    if (!this.pushed || typeof history === 'undefined') return Promise.resolve()
    this.pushed = false
    try {
      if ((history.state as Record<string, unknown> | null)?.[HISTORY_FLAG]) {
        return new Promise((resolve) => {
          this.ignorePop = true
          this.pendingResolve = resolve
          history.back()
          window.setTimeout(() => {
            if (this.pendingResolve === resolve) this.finishPendingPop()
          }, 100)
        })
      }
    } catch {
      this.finishPendingPop()
    }
    return Promise.resolve()
  }

  /**
   * Call from window `popstate`. Returns true when the event was an internal programmatic pop.
   */
  consumeInternalPop(): boolean {
    if (this.ignorePop) {
      this.finishPendingPop()
      return true
    }
    return false
  }

  /** Clear pushed flag after OS back exits the overlay. */
  resetPushed(): void {
    this.pushed = false
  }

  private finishPendingPop(): void {
    const resolve = this.pendingResolve
    this.pendingResolve = null
    this.ignorePop = false
    resolve?.()
  }
}
