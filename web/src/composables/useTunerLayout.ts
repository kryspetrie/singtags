/**
 * Digital Tuner density / orientation layout signals.
 * Local short MQ first (promote to shared lib only if a second feature needs it).
 */
import { onMounted, onUnmounted, ref, computed } from 'vue'
import {
  NARROW_VIEWPORT_MQ,
  readIsNarrowViewport,
  syncNarrowViewportDataset,
} from '../lib/narrowViewport'

/** Short viewport (phone landscape / short windows). */
export const TUNER_SHORT_MQ = '(max-height: 500px)'

export type TunerLayoutMode = 'wide' | 'narrow-portrait' | 'narrow-landscape'

export function useTunerLayout() {
  const isNarrow = ref(readIsNarrowViewport())
  const isShort = ref(false)
  const isLandscape = ref(false)

  let narrowMq: MediaQueryList | null = null
  let shortMq: MediaQueryList | null = null
  let orientMq: MediaQueryList | null = null

  function sync(): void {
    isNarrow.value = syncNarrowViewportDataset(narrowMq?.matches ?? readIsNarrowViewport()) === '1'
    isShort.value = shortMq?.matches ?? false
    isLandscape.value = orientMq?.matches ?? false
  }

  const mode = computed((): TunerLayoutMode => {
    if (!isNarrow.value) return 'wide'
    if (isLandscape.value || isShort.value) return 'narrow-landscape'
    return 'narrow-portrait'
  })

  onMounted(() => {
    if (typeof window === 'undefined') return
    narrowMq = window.matchMedia(NARROW_VIEWPORT_MQ)
    shortMq = window.matchMedia(TUNER_SHORT_MQ)
    orientMq = window.matchMedia('(orientation: landscape)')
    sync()
    narrowMq.addEventListener('change', sync)
    shortMq.addEventListener('change', sync)
    orientMq.addEventListener('change', sync)
  })

  onUnmounted(() => {
    narrowMq?.removeEventListener('change', sync)
    shortMq?.removeEventListener('change', sync)
    orientMq?.removeEventListener('change', sync)
  })

  return { isNarrow, isShort, isLandscape, mode }
}
