/**
 * One-shot Coach UI intents (lane → dock) without growing TagRollEditorView.
 * Queues when the dock is not mounted yet; delivers immediately otherwise.
 */
export type CoachOpenChooseSeed = {
  tick: number
  rootPc?: number
  natureId?: string
  voicing?: string | null
}

export type CoachUiIntent =
  | { type: 'openCheck' }
  | ({ type: 'openChoose' } & Partial<CoachOpenChooseSeed>)

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

/**
 * Subscribe; immediately delivers any pending intent.
 * Pending is cleared on the next microtask so co-mounted subscribers
 * in the same tick (guided + dock) can both receive it.
 */
export function subscribeCoachUiIntent(fn: Listener): () => void {
  listeners.add(fn)
  if (pending) {
    const i = pending
    Promise.resolve().then(() => {
      if (pending === i) pending = null
    })
    fn(i)
  }
  return () => {
    listeners.delete(fn)
  }
}
