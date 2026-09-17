<script setup lang="ts">
/**
 * Horizontal piano viewport: the keys themselves are the scroller —
 * hold/multitouch to play (with glide), flick horizontally to pan octaves.
 */
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

const emit = defineEmits<{
  'note-on': [note: string]
  'note-off': [note: string]
  scroll: []
}>()

const scrollRef = ref<HTMLElement | null>(null)

/** Ignore finger jitter below this while deciding hold vs pan. */
const PAN_THRESHOLD_PX = 28
/** After this still-ish hold, this pointer only plays (never pans). */
const PLAY_LOCK_MS = 100

type StripPointer = {
  note: string | null
  startX: number
  startY: number
  startScroll: number
  panActive: boolean
  /** Committed to playing — glide between keys, never convert to pan. */
  playLocked: boolean
  downAt: number
  lockTimer: number | null
}
const pointers = new Map<number, StripPointer>()

function onScroll(): void {
  emit('scroll')
}

function noteAtClientPoint(clientX: number, clientY: number): string | null {
  const scroller = scrollRef.value
  if (!scroller) return null
  const stack = document.elementsFromPoint?.(clientX, clientY) ?? [
    document.elementFromPoint(clientX, clientY),
  ]
  for (const el of stack) {
    if (!(el instanceof Element)) continue
    if (!scroller.contains(el)) continue
    const btn = el.closest('button.note') as HTMLElement | null
    if (btn && scroller.contains(btn)) return btn.dataset.note ?? null
  }
  return null
}

function clearLockTimer(st: StripPointer): void {
  if (st.lockTimer != null) {
    window.clearTimeout(st.lockTimer)
    st.lockTimer = null
  }
}

function setPointerNote(st: StripPointer, next: string | null): void {
  if (st.note === next) return
  if (st.note) emit('note-off', st.note)
  st.note = next
  if (next) emit('note-on', next)
}

function onStripPointerDown(e: PointerEvent): void {
  if (e.button !== 0 && e.pointerType === 'mouse') return
  const target = e.target as HTMLElement | null
  const noteBtn = target?.closest?.('button.note') as HTMLElement | null
  const note = noteBtn?.dataset.note ?? null
  const st: StripPointer = {
    note,
    startX: e.clientX,
    startY: e.clientY,
    startScroll: scrollRef.value?.scrollLeft ?? 0,
    panActive: false,
    playLocked: false,
    downAt: performance.now(),
    lockTimer: null,
  }
  pointers.set(e.pointerId, st)
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  if (note) {
    emit('note-on', note)
    // Hold still → lock play so later jitter can't steal the note into a pan.
    st.lockTimer = window.setTimeout(() => {
      const cur = pointers.get(e.pointerId)
      if (!cur || cur.panActive) return
      cur.playLocked = true
      cur.lockTimer = null
    }, PLAY_LOCK_MS)
  }
}

function onStripPointerMove(e: PointerEvent): void {
  const st = pointers.get(e.pointerId)
  if (!st) return

  if (st.panActive) {
    const scroller = scrollRef.value
    if (!scroller) return
    const dx = e.clientX - st.startX
    scroller.scrollLeft = st.startScroll - dx
    emit('scroll')
    return
  }

  if (st.playLocked) {
    setPointerNote(st, noteAtClientPoint(e.clientX, e.clientY))
    return
  }

  const dx = e.clientX - st.startX
  const dy = e.clientY - st.startY
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)

  // Clear horizontal flick before lock → octave pan (cancel the brief note).
  if (adx >= PAN_THRESHOLD_PX && adx > ady * 1.35) {
    clearLockTimer(st)
    st.panActive = true
    if (st.note) {
      emit('note-off', st.note)
      st.note = null
    }
    const scroller = scrollRef.value
    if (!scroller) return
    scroller.scrollLeft = st.startScroll - dx
    emit('scroll')
    return
  }

  // Below pan threshold: stay on the original key (ignore jitter).
}

function onStripPointerUp(e: PointerEvent): void {
  const st = pointers.get(e.pointerId)
  if (!st) return
  pointers.delete(e.pointerId)
  clearLockTimer(st)
  try {
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
  } catch {
    /* already released */
  }
  // Touch/mouse play shouldn't leave a focused key (global outline leaked beside keys).
  const active = document.activeElement
  if (
    active instanceof HTMLElement &&
    active.classList.contains('note') &&
    scrollRef.value?.contains(active)
  ) {
    active.blur()
  }
  if (st.panActive) {
    emit('scroll')
    return
  }
  if (st.note) emit('note-off', st.note)
}

let ro: ResizeObserver | null = null

onMounted(() => {
  if (scrollRef.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => emit('scroll'))
    ro.observe(scrollRef.value)
    const inner = scrollRef.value.firstElementChild
    if (inner) ro.observe(inner)
  }
})

onUnmounted(() => {
  ro?.disconnect()
  ro = null
  for (const st of pointers.values()) {
    clearLockTimer(st)
    if (st.note) emit('note-off', st.note)
  }
  pointers.clear()
})

defineExpose({
  getScrollElement: () => scrollRef.value,
  /** @deprecated No custom thumb; kept for callers that reflow after resize. */
  syncThumb() {
    void nextTick(() => emit('scroll'))
  },
  scrollToNote(note: string, opts?: { behavior?: ScrollBehavior }) {
    const scroller = scrollRef.value
    if (!scroller) return
    const target = scroller.querySelector<HTMLElement>(
      `button.note[data-note="${CSS.escape(note)}"]`,
    )
    if (!target) return
    const left = target.offsetLeft + target.offsetWidth / 2 - scroller.clientWidth / 2
    scroller.scrollTo({
      left: Math.max(0, left),
      behavior: opts?.behavior ?? 'instant',
    })
    emit('scroll')
  },
})
</script>

<template>
  <div
    ref="scrollRef"
    class="piano-h-scroller"
    @scroll.passive="onScroll"
    @pointerdown="onStripPointerDown"
    @pointermove="onStripPointerMove"
    @pointerup="onStripPointerUp"
    @pointercancel="onStripPointerUp"
  >
    <slot />
  </div>
</template>

<style scoped>
.piano-h-scroller {
  width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  /* Own the gesture so drag-to-pan + note hits work on mobile. */
  touch-action: none;
  cursor: grab;
  scrollbar-width: none;
}
.piano-h-scroller:active {
  cursor: grabbing;
}
.piano-h-scroller::-webkit-scrollbar {
  display: none;
}
</style>
