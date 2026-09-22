/**
 * Tag Studio Coach open/close + dual-monitor pop-out shell.
 */
import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import {
  buildCoachPopoutUrl,
  isCoachPopoutSearch,
  openCoachPopoutChannel,
  type CoachPopoutChannel,
  type CoachPopoutMsg,
  type CoachTransportIntentAction,
  dispatchCoachPopoutIntent,
} from '../lib/arranging/coachPopout'
import type { CoachTransportView } from './useCoachTransport'
import { usePreferencesStore } from '../stores/preferences'

export function useTagRollCoachShell(opts: {
  arrangingEnabled: Ref<boolean>
  projectId: Ref<string | null | undefined>
  harmonizeOpen: Ref<boolean>
  setPlayheadTick: (tick: number) => void
  /** Apply coach overlay on the roll (pop-out → main window). */
  onRemoteFocusRange?: (startTick: number, endTick: number) => void
  /** Pop-out → main: update roll transport mirror. */
  onRemoteTransportState?: (active: boolean, model: CoachTransportView | null) => void
}) {
  const prefs = usePreferencesStore()
  const coachOpen = ref(false)
  const coachDetached = ref(false)
  const isPopoutWindow = ref(false)
  const popoutHint = ref('')
  let channel: CoachPopoutChannel | null = null
  let popoutWin: Window | null = null

  function clearHintSoon(): void {
    window.setTimeout(() => {
      popoutHint.value = ''
    }, 5000)
  }

  function ensureCoachOpen(): void {
    if (!opts.arrangingEnabled.value) return
    if (coachDetached.value && popoutWin && !popoutWin.closed) {
      popoutWin.focus()
      return
    }
    coachOpen.value = true
    opts.harmonizeOpen.value = false
  }

  function handleChannelMsg(msg: CoachPopoutMsg): void {
    if (msg.type === 'playhead') opts.setPlayheadTick(msg.tick)
    if (msg.type === 'focusRange' && !isPopoutWindow.value) {
      opts.onRemoteFocusRange?.(msg.startTick, msg.endTick)
    }
    if (msg.type === 'transportState' && !isPopoutWindow.value) {
      opts.onRemoteTransportState?.(msg.active, msg.model)
    }
    if (msg.type === 'transportIntent' && isPopoutWindow.value) {
      dispatchCoachPopoutIntent(msg.action)
    }
    if (msg.type === 'popIn' && !isPopoutWindow.value) {
      coachDetached.value = false
      coachOpen.value = true
      popoutWin = null
    }
    if (msg.type === 'closed' && !isPopoutWindow.value) {
      coachDetached.value = false
      popoutWin = null
      opts.onRemoteTransportState?.(false, null)
    }
  }

  function bindChannel(projectId: string): void {
    channel?.close()
    channel = openCoachPopoutChannel(projectId, handleChannelMsg)
  }

  function onCoachClose(): void {
    coachOpen.value = false
    if (isPopoutWindow.value) {
      const id = opts.projectId.value
      if (id) channel?.post({ type: 'closed', projectId: id })
      window.close()
    }
  }

  function toggleCoach(): void {
    if (!opts.arrangingEnabled.value) return
    if (coachDetached.value && popoutWin && !popoutWin.closed) {
      popoutWin.focus()
      return
    }
    if (coachOpen.value) {
      onCoachClose()
      return
    }
    ensureCoachOpen()
  }

  /** Opening the Coach lane always brings up the Coach sidebar too. */
  watch(
    () => prefs.tagRollCoachLaneCollapsed,
    (collapsed) => {
      if (!collapsed) ensureCoachOpen()
    },
  )

  function onCoachPopOut(): void {
    const id = opts.projectId.value
    if (!id) return
    const path = buildCoachPopoutUrl(window.location.href)
    const w = window.open(path, `singtags-coach-${id}`)
    if (!w) {
      popoutHint.value =
        'Pop-out was blocked by the browser. Allow pop-ups, or keep the dock docked.'
      clearHintSoon()
      return
    }
    popoutWin = w
    coachOpen.value = false
    coachDetached.value = true
    bindChannel(id)
  }

  function postCoachFocusRange(startTick: number, endTick: number): void {
    const id = opts.projectId.value
    if (!id || !channel || !isPopoutWindow.value) return
    channel.post({ type: 'focusRange', projectId: id, startTick, endTick })
  }

  function postTransportState(active: boolean, model: CoachTransportView | null): void {
    const id = opts.projectId.value
    if (!id || !channel || !isPopoutWindow.value) return
    channel.post({ type: 'transportState', projectId: id, active, model })
  }

  function postTransportIntent(action: CoachTransportIntentAction): void {
    const id = opts.projectId.value
    if (!id || !channel || isPopoutWindow.value) return
    if (!coachDetached.value) return
    channel.post({ type: 'transportIntent', projectId: id, action })
  }

  function onCoachPopIn(): void {
    const id = opts.projectId.value
    if (!id) return
    channel?.post({ type: 'popIn', projectId: id })
    if (isPopoutWindow.value) window.close()
    else {
      coachDetached.value = false
      coachOpen.value = true
      if (popoutWin && !popoutWin.closed) popoutWin.close()
      popoutWin = null
      opts.onRemoteTransportState?.(false, null)
    }
  }

  const showDetachedBanner = computed(
    () => coachDetached.value && !isPopoutWindow.value && !coachOpen.value,
  )

  watch(
    () => opts.projectId.value,
    (id) => {
      if (id) bindChannel(id)
    },
  )

  onMounted(() => {
    if (isCoachPopoutSearch(window.location.search)) {
      isPopoutWindow.value = true
      if (opts.arrangingEnabled.value) {
        coachOpen.value = true
        opts.harmonizeOpen.value = false
      }
      popoutHint.value =
        'Pop-out Coach — edits sync best-effort (last write wins). Prefer one window for note edits.'
    }
    const id = opts.projectId.value
    if (id) bindChannel(id)
  })

  onUnmounted(() => {
    channel?.close()
    channel = null
  })

  return {
    coachOpen,
    coachDetached,
    isPopoutWindow,
    popoutHint,
    showDetachedBanner,
    toggleCoach,
    ensureCoachOpen,
    onCoachClose,
    onCoachPopOut,
    onCoachPopIn,
    postCoachFocusRange,
    postTransportState,
    postTransportIntent,
  }
}
