/**
 * Right-dock pop-out (Coach / Harmonize / Sketch chord edit):
 * URL flag + BroadcastChannel (best-effort, not CRDT).
 */
import type { CoachTransportView } from '../../composables/useCoachTransport'

/** Legacy Coach-only flag (still accepted). */
export const COACH_POPOUT_QUERY = 'coachPopout'
/** Generalized dock flag: coach | harmonize | chordEdit */
export const DOCK_POPOUT_QUERY = 'dockPopout'
export const DOCK_POPOUT_SEG_QUERY = 'dockSeg'
export const DOCK_POPOUT_VARIANT_QUERY = 'dockVariant'

export type RightDockKind = 'coach' | 'harmonize' | 'chordEdit'

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
  | { type: 'popIn'; projectId: string; dock?: RightDockKind }
  | { type: 'closed'; projectId: string; dock?: RightDockKind }

export type ChordEditPopoutParams = {
  segId: string
  variant: 'declared' | 'detected'
}

export function coachChannelName(projectId: string): string {
  return `singtags-coach-${projectId}`
}

export function parseDockPopoutKind(search: string): RightDockKind | null {
  try {
    const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    const dock = q.get(DOCK_POPOUT_QUERY)
    if (dock === 'coach' || dock === 'harmonize' || dock === 'chordEdit') return dock
    if (q.get(COACH_POPOUT_QUERY) === '1') return 'coach'
    return null
  } catch {
    return null
  }
}

export function parseChordEditPopoutParams(search: string): ChordEditPopoutParams | null {
  try {
    const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    const segId = q.get(DOCK_POPOUT_SEG_QUERY)?.trim()
    const variant = q.get(DOCK_POPOUT_VARIANT_QUERY)
    if (!segId) return null
    if (variant !== 'declared' && variant !== 'detected') return null
    return { segId, variant }
  } catch {
    return null
  }
}

export function isCoachPopoutSearch(search: string): boolean {
  return parseDockPopoutKind(search) === 'coach'
}

export function buildDockPopoutUrl(
  href: string,
  kind: RightDockKind,
  chordEdit?: ChordEditPopoutParams | null,
): string {
  const url = new URL(href, 'http://local.invalid')
  url.searchParams.delete(COACH_POPOUT_QUERY)
  url.searchParams.set(DOCK_POPOUT_QUERY, kind)
  if (kind === 'chordEdit' && chordEdit) {
    url.searchParams.set(DOCK_POPOUT_SEG_QUERY, chordEdit.segId)
    url.searchParams.set(DOCK_POPOUT_VARIANT_QUERY, chordEdit.variant)
  } else {
    url.searchParams.delete(DOCK_POPOUT_SEG_QUERY)
    url.searchParams.delete(DOCK_POPOUT_VARIANT_QUERY)
  }
  return `${url.pathname}${url.search}${url.hash}`
}

/** @deprecated Prefer {@link buildDockPopoutUrl}. */
export function buildCoachPopoutUrl(href: string): string {
  return buildDockPopoutUrl(href, 'coach')
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

export function dockKindLabel(kind: RightDockKind): string {
  if (kind === 'harmonize') return 'Harmonize'
  if (kind === 'chordEdit') return 'Chord editor'
  return 'Coach'
}
