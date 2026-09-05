/**
 * Lightweight “user is mid-activity” registry so deferred PWA updates can wait.
 *
 * Callers set named reasons (audio playing, sheet fullscreen, …). When the set
 * is empty (and no document fullscreen), the session is considered idle.
 */

type Listener = () => void

const reasons = new Set<string>()
const listeners = new Set<Listener>()

function notify(): void {
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      /* ignore listener errors */
    }
  }
}

/** Mark or clear a named busy reason (idempotent). */
export function setSessionBusy(reason: string, busy: boolean): void {
  const key = reason.trim()
  if (!key) return
  const before = reasons.size
  if (busy) reasons.add(key)
  else reasons.delete(key)
  if (reasons.size !== before) notify()
}

/** True when any reason is set or the browser is in native fullscreen. */
export function isSessionBusy(): boolean {
  if (reasons.size > 0) return true
  if (typeof document !== 'undefined' && document.fullscreenElement) return true
  return false
}

/** Snapshot of active reason keys (tests / diagnostics). */
export function sessionBusyReasons(): string[] {
  return [...reasons].sort()
}

/** Subscribe to busy-set changes. Returns unsubscribe. */
export function onSessionBusyChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Clear all reasons (tests). */
export function resetSessionBusyForTests(): void {
  reasons.clear()
  notify()
}
