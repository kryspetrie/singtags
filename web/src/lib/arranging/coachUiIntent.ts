/**
 * One-shot Coach UI intents (lane → dock) without growing TagRollEditorView.
 * Queues when the dock is not mounted yet; delivers immediately otherwise.
 */
export type CoachUiIntent = { type: 'openCheck' } | { type: 'openChoose' }

type Listener = (intent: CoachUiIntent) => void

const listeners = new Set<Listener>()
let pending: CoachUiIntent | null = null

export function requestCoachUi(intent: CoachUiIntent): void {
  if (listeners.size === 0) {
    pending = intent
    return
  }
  pending = null
  for (const fn of listeners) fn(intent)
}

/** Subscribe; immediately delivers any pending intent (then clears it). */
export function subscribeCoachUiIntent(fn: Listener): () => void {
  listeners.add(fn)
  if (pending) {
    const i = pending
    pending = null
    fn(i)
  }
  return () => {
    listeners.delete(fn)
  }
}
