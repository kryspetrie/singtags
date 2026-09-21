/**
 * Shared coach highlight bus (dock ↔ lane ↔ issues). Best-effort BroadcastChannel for pop-out.
 */
export type CoachHighlightKind = 'moment' | 'issue' | 'pillar' | 'ring' | 'vl' | 'gap'

export type CoachHighlight = {
  tick: number
  kind: CoachHighlightKind
  /** Bumps on each set so UI can re-pulse the same tick. */
  pulseId: number
  projectId?: string
  lintId?: string
}

type Listener = (h: CoachHighlight | null) => void

let current: CoachHighlight | null = null
let pulseSeq = 0
const listeners = new Set<Listener>()
let channel: BroadcastChannel | null = null
let channelProjectId: string | null = null

function notify(h: CoachHighlight | null): void {
  current = h
  for (const fn of listeners) fn(h)
}

export function getCoachHighlight(): CoachHighlight | null {
  return current
}

export function setCoachHighlight(
  partial: Omit<CoachHighlight, 'pulseId'> & { pulseId?: number },
): CoachHighlight {
  const next: CoachHighlight = {
    ...partial,
    pulseId: partial.pulseId ?? ++pulseSeq,
  }
  notify(next)
  if (channel && next.projectId) {
    channel.postMessage({ type: 'highlight', ...next })
  }
  return next
}

export function clearCoachHighlight(): void {
  notify(null)
}

export function subscribeCoachHighlight(fn: Listener): () => void {
  listeners.add(fn)
  fn(current)
  return () => listeners.delete(fn)
}

export function bindCoachHighlightChannel(projectId: string): () => void {
  channel?.close()
  channelProjectId = projectId
  if (typeof BroadcastChannel === 'undefined') {
    return () => undefined
  }
  channel = new BroadcastChannel(`singtags-coach-hl-${projectId}`)
  const onMsg = (ev: MessageEvent) => {
    const data = ev.data as CoachHighlight & { type?: string }
    if (!data || data.type !== 'highlight' || data.projectId !== channelProjectId) return
    notify({
      tick: data.tick,
      kind: data.kind,
      pulseId: data.pulseId,
      projectId: data.projectId,
      lintId: data.lintId,
    })
  }
  channel.addEventListener('message', onMsg)
  return () => {
    channel?.removeEventListener('message', onMsg)
    channel?.close()
    channel = null
  }
}

export type CoachLaneLens = 'overview' | 'gaps' | 'ring' | 'voiceLead' | 'issues'

export const COACH_LANE_LENSES: { id: CoachLaneLens; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'gaps', label: 'Gaps' },
  { id: 'ring', label: 'Ring' },
  { id: 'voiceLead', label: 'Voice-leading' },
  { id: 'issues', label: 'Issues' },
]
