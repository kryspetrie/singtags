/**
 * Tag Studio Coach open/close + dual-monitor pop-out shell.
 */
import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import {
  buildCoachPopoutUrl,
  isCoachPopoutSearch,
  openCoachPopoutChannel,
  type CoachPopoutChannel,
} from '../lib/arranging/coachPopout'
import { usePreferencesStore } from '../stores/preferences'

export function useTagRollCoachShell(opts: {
  arrangingEnabled: Ref<boolean>
  projectId: Ref<string | null | undefined>
  harmonizeOpen: Ref<boolean>
  setPlayheadTick: (tick: number) => void
  selectNotes: (ids: string[]) => void
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

  function bindChannel(projectId: string): void {
    channel?.close()
    channel = openCoachPopoutChannel(projectId, (msg) => {
      if (msg.type === 'playhead') opts.setPlayheadTick(msg.tick)
      if (msg.type === 'selection') opts.selectNotes(msg.noteIds)
      if (msg.type === 'popIn' && !isPopoutWindow.value) {
        coachDetached.value = false
        coachOpen.value = true
        popoutWin = null
      }
      if (msg.type === 'closed' && !isPopoutWindow.value) {
        coachDetached.value = false
        popoutWin = null
      }
    })
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
  }
}
