/**
 * Tag Studio right-dock open/close + dual-monitor pop-out shell
 * (Coach, Harmonize, Sketch/Detected chord edit).
 */
import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import {
  buildDockPopoutUrl,
  dockKindLabel,
  openCoachPopoutChannel,
  parseChordEditPopoutParams,
  parseDockPopoutKind,
  type ChordEditPopoutParams,
  type CoachPopoutChannel,
  type CoachPopoutMsg,
  type CoachTransportIntentAction,
  type RightDockKind,
  dispatchCoachPopoutIntent,
} from '../lib/arranging/coachPopout'
import type { CoachTransportView } from './useCoachTransport'
import type { ChordEditDockSession } from './useTagRollChordEditDock'
import { usePreferencesStore } from '../stores/preferences'
import { useTagRollStore } from '../stores/tagRoll'

export function useTagRollCoachShell(opts: {
  arrangingEnabled: Ref<boolean>
  projectId: Ref<string | null | undefined>
  harmonizeOpen: Ref<boolean>
  chordEditSession: Ref<ChordEditDockSession | null>
  setPlayheadTick: (tick: number) => void
  /** Apply coach overlay on the roll (pop-out → main window). */
  onRemoteFocusRange?: (startTick: number, endTick: number) => void
  /** Pop-out → main: update roll transport mirror. */
  onRemoteTransportState?: (active: boolean, model: CoachTransportView | null) => void
}) {
  const prefs = usePreferencesStore()
const tagStore = useTagRollStore()
  const coachOpen = ref(false)
  /** Which dock is currently in a detached pop-out window (main only). */
  const detachedKind = ref<RightDockKind | null>(null)
  const isPopoutWindow = ref(false)
  const popoutKind = ref<RightDockKind | null>(null)
  const popoutHint = ref('')
  let channel: CoachPopoutChannel | null = null
  let popoutWin: Window | null = null
  let closedPoll: ReturnType<typeof setInterval> | null = null

  const coachDetached = computed(() => detachedKind.value === 'coach')

  function clearHintSoon(): void {
    window.setTimeout(() => {
      popoutHint.value = ''
    }, 5000)
  }

  function stopClosedPoll(): void {
    if (closedPoll != null) {
      clearInterval(closedPoll)
      closedPoll = null
    }
  }

  function closeLocalDock(kind: RightDockKind): void {
    if (kind === 'coach') coachOpen.value = false
    if (kind === 'harmonize') opts.harmonizeOpen.value = false
    if (kind === 'chordEdit') opts.chordEditSession.value = null
  }

  function openLocalDock(kind: RightDockKind, chordEdit?: ChordEditPopoutParams | null): void {
    if (kind === 'coach') {
      if (!opts.arrangingEnabled.value) return
      coachOpen.value = true
      opts.harmonizeOpen.value = false
      opts.chordEditSession.value = null
      tagStore.assignNoteRolesActive = false
      return
    }
    if (kind === 'harmonize') {
      opts.harmonizeOpen.value = true
      coachOpen.value = false
      opts.chordEditSession.value = null
      tagStore.assignNoteRolesActive = false
      return
    }
    if (chordEdit) {
      opts.chordEditSession.value = {
        variant: chordEdit.variant,
        segId: chordEdit.segId,
      }
      coachOpen.value = false
      opts.harmonizeOpen.value = false
    }
  }

  function restoreDetachedDock(): void {
    const kind = detachedKind.value
    stopClosedPoll()
    popoutWin = null
    if (!kind) return
    detachedKind.value = null
    // Restore the dock into the main window when the pop-out closes.
    if (kind === 'chordEdit') {
      // Session was cleared on pop-out; reopen empty Sketch dock cue via banner only
      // unless we stashed params — use lastPopoutChordEdit.
      openLocalDock(kind, lastPopoutChordEdit)
    } else {
      openLocalDock(kind)
    }
    opts.onRemoteTransportState?.(false, null)
  }

  let lastPopoutChordEdit: ChordEditPopoutParams | null = null

  function ensureCoachOpen(): void {
    if (!opts.arrangingEnabled.value) return
    if (detachedKind.value === 'coach' && popoutWin && !popoutWin.closed) {
      popoutWin.focus()
      return
    }
    openLocalDock('coach')
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
      const kind = msg.dock ?? detachedKind.value ?? 'coach'
      stopClosedPoll()
      detachedKind.value = null
      popoutWin = null
      openLocalDock(kind, kind === 'chordEdit' ? lastPopoutChordEdit : null)
      opts.onRemoteTransportState?.(false, null)
    }
    if (msg.type === 'closed' && !isPopoutWindow.value) {
      restoreDetachedDock()
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
      const kind = popoutKind.value ?? 'coach'
      if (id) channel?.post({ type: 'closed', projectId: id, dock: kind })
      window.close()
    }
  }

  function onHarmonizeCloseFromPopout(): void {
    if (!isPopoutWindow.value) return
    const id = opts.projectId.value
    if (id) channel?.post({ type: 'closed', projectId: id, dock: 'harmonize' })
    window.close()
  }

  function onChordEditCloseFromPopout(): void {
    if (!isPopoutWindow.value) return
    const id = opts.projectId.value
    if (id) channel?.post({ type: 'closed', projectId: id, dock: 'chordEdit' })
    window.close()
  }

  function toggleCoach(): void {
    if (!opts.arrangingEnabled.value) return
    if (detachedKind.value === 'coach' && popoutWin && !popoutWin.closed) {
      popoutWin.focus()
      return
    }
    if (coachOpen.value) {
      onCoachClose()
      return
    }
    ensureCoachOpen()
  }

  function watchPopoutClosed(w: Window): void {
    stopClosedPoll()
    closedPoll = setInterval(() => {
      if (!w.closed) return
      restoreDetachedDock()
    }, 400)
  }

  function onDockPopOut(kind: RightDockKind): void {
    const id = opts.projectId.value
    if (!id) return
    let chordEdit: ChordEditPopoutParams | null = null
    if (kind === 'chordEdit') {
      const s = opts.chordEditSession.value
      if (!s) return
      chordEdit = { segId: s.segId, variant: s.variant }
      lastPopoutChordEdit = chordEdit
    } else {
      lastPopoutChordEdit = null
    }
    const path = buildDockPopoutUrl(window.location.href, kind, chordEdit)
    const w = window.open(path, `singtags-dock-${kind}-${id}`)
    if (!w) {
      popoutHint.value =
        'Pop-out was blocked by the browser. Allow pop-ups, or keep the dock docked.'
      clearHintSoon()
      return
    }
    popoutWin = w
    closeLocalDock(kind)
    detachedKind.value = kind
    bindChannel(id)
    watchPopoutClosed(w)
  }

  function onCoachPopOut(): void {
    onDockPopOut('coach')
  }

  function onHarmonizePopOut(): void {
    onDockPopOut('harmonize')
  }

  function onChordEditPopOut(): void {
    onDockPopOut('chordEdit')
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
    if (detachedKind.value !== 'coach') return
    channel.post({ type: 'transportIntent', projectId: id, action })
  }

  function onCoachPopIn(): void {
    const id = opts.projectId.value
    if (!id) return
    const kind = (isPopoutWindow.value ? popoutKind.value : detachedKind.value) ?? 'coach'
    channel?.post({ type: 'popIn', projectId: id, dock: kind })
    if (isPopoutWindow.value) window.close()
    else {
      stopClosedPoll()
      detachedKind.value = null
      openLocalDock(kind, kind === 'chordEdit' ? lastPopoutChordEdit : null)
      if (popoutWin && !popoutWin.closed) popoutWin.close()
      popoutWin = null
      opts.onRemoteTransportState?.(false, null)
    }
  }

  const showDetachedBanner = computed(
    () =>
      detachedKind.value != null &&
      !isPopoutWindow.value &&
      !(
        (detachedKind.value === 'coach' && coachOpen.value) ||
        (detachedKind.value === 'harmonize' && opts.harmonizeOpen.value) ||
        (detachedKind.value === 'chordEdit' && opts.chordEditSession.value != null)
      ),
  )

  const detachedBannerLabel = computed(() =>
    detachedKind.value ? dockKindLabel(detachedKind.value) : 'Dock',
  )

  watch(
    () => opts.projectId.value,
    (id) => {
      if (id) bindChannel(id)
    },
  )

  function onPopoutPageHide(): void {
    if (!isPopoutWindow.value) return
    const id = opts.projectId.value
    const kind = popoutKind.value
    if (id && kind) channel?.post({ type: 'closed', projectId: id, dock: kind })
  }

  onMounted(() => {
    const kind = parseDockPopoutKind(window.location.search)
    if (kind) {
      isPopoutWindow.value = true
      popoutKind.value = kind
      if (kind === 'coach' && opts.arrangingEnabled.value) openLocalDock('coach')
      else if (kind === 'harmonize') openLocalDock('harmonize')
      else if (kind === 'chordEdit') {
        const params = parseChordEditPopoutParams(window.location.search)
        openLocalDock('chordEdit', params)
      }
      popoutHint.value = `Pop-out ${dockKindLabel(kind)} — edits sync best-effort (last write wins). Prefer one window for note edits.`
      window.addEventListener('pagehide', onPopoutPageHide)
    }
    const id = opts.projectId.value
    if (id) bindChannel(id)
  })

  onUnmounted(() => {
    window.removeEventListener('pagehide', onPopoutPageHide)
    stopClosedPoll()
    channel?.close()
    channel = null
  })

  return {
    coachOpen,
    coachDetached,
    detachedKind,
    isPopoutWindow,
    popoutKind,
    popoutHint,
    showDetachedBanner,
    detachedBannerLabel,
    toggleCoach,
    ensureCoachOpen,
    onCoachClose,
    onCoachPopOut,
    onHarmonizePopOut,
    onChordEditPopOut,
    onCoachPopIn,
    onHarmonizeCloseFromPopout,
    onChordEditCloseFromPopout,
    postCoachFocusRange,
    postTransportState,
    postTransportIntent,
  }
}
