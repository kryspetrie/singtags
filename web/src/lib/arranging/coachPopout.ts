/**
 * Dual-monitor Coach pop-out: URL flag + BroadcastChannel (best-effort, not CRDT).
 */
import type { CoachTransportView } from '../../composables/useCoachTransport'

export const COACH_POPOUT_QUERY = 'coachPopout'

export type CoachTransportIntentAction =
  | 'prev'
  | 'next'
  | 'primary'
  | 'hear'
  | 'lock'
  | 'skip'
  | 'secondary'

export type CoachPopoutMsg =
  | { type: 'playhead'; projectId: string; tick: number }
  /** Overlay-only inspect bounds on the main roll (no note selection). */
  | { type: 'focusRange'; projectId: string; startTick: number; endTick: number }
  /** Pop-out → main: keep roll transport strip in sync. */
  | {
      type: 'transportState'
      projectId: string
      active: boolean
      model: CoachTransportView | null
    }
  /** Main roll strip → pop-out: execute against the live coach dock. */
  | { type: 'transportIntent'; projectId: string; action: CoachTransportIntentAction }
  | { type: 'popIn'; projectId: string }
  | { type: 'closed'; projectId: string }

export function coachChannelName(projectId: string): string {
  return `singtags-coach-${projectId}`
}

export function isCoachPopoutSearch(search: string): boolean {
  try {
    return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get(
      COACH_POPOUT_QUERY,
    ) === '1'
  } catch {
    return false
  }
}

export function buildCoachPopoutUrl(href: string): string {
  const url = new URL(href, 'http://local.invalid')
  url.searchParams.set(COACH_POPOUT_QUERY, '1')
  // URL constructed with base for parsing only — return path+query+hash for same-origin open
  return `${url.pathname}${url.search}${url.hash}`
}

export type CoachPopoutChannel = {
  post: (msg: CoachPopoutMsg) => void
  close: () => void
}

export function openCoachPopoutChannel(
  projectId: string,
  onMessage: (msg: CoachPopoutMsg) => void,
): CoachPopoutChannel {
  if (typeof BroadcastChannel === 'undefined') {
    return { post: () => undefined, close: () => undefined }
  }
  const ch = new BroadcastChannel(coachChannelName(projectId))
  const handler = (ev: MessageEvent<CoachPopoutMsg>) => {
    const msg = ev.data
    if (!msg || msg.projectId !== projectId) return
    onMessage(msg)
  }
  ch.addEventListener('message', handler)
  return {
    post: (msg) => ch.postMessage(msg),
    close: () => {
      ch.removeEventListener('message', handler)
      ch.close()
    },
  }
}

/** Pop-out dock registers here so main-window intents can run against the live coach. */
type IntentHandler = (action: CoachTransportIntentAction) => void
let popoutIntentHandler: IntentHandler | null = null

export function registerCoachPopoutIntentHandler(handler: IntentHandler): () => void {
  popoutIntentHandler = handler
  return () => {
    if (popoutIntentHandler === handler) popoutIntentHandler = null
  }
}

export function dispatchCoachPopoutIntent(action: CoachTransportIntentAction): void {
  popoutIntentHandler?.(action)
}
