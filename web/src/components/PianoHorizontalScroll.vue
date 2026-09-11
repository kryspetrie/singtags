<script setup lang="ts">
/**
 * Horizontal piano viewport: the keys themselves are the scroller —
 * drag to pan, short press to play (multitouch-friendly).
 */
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

const emit = defineEmits<{
  'note-on': [note: string]
  'note-off': [note: string]
  scroll: []
}>()

const scrollRef = ref<HTMLElement | null>(null)

const PAN_THRESHOLD_PX = 12

type StripPointer = {
  note: string | null
  startX: number
  startScroll: number
  panActive: boolean
}
const pointers = new Map<number, StripPointer>()

function onScroll(): void {
  emit('scroll')
}

function onStripPointerDown(e: PointerEvent): void {
  if (e.button !== 0 && e.pointerType === 'mouse') return
  const target = e.target as HTMLElement | null
  const noteBtn = target?.closest?.('button.note') as HTMLElement | null
  const note = noteBtn?.dataset.note ?? null
  pointers.set(e.pointerId, {
    note,
    startX: e.clientX,
    startScroll: scrollRef.value?.scrollLeft ?? 0,
    panActive: false,
  })
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  if (note) emit('note-on', note)
}

function onStripPointerMove(e: PointerEvent): void {
  const st = pointers.get(e.pointerId)
  if (!st) return
  const dx = e.clientX - st.startX
  if (!st.panActive && Math.abs(dx) >= PAN_THRESHOLD_PX) {
    st.panActive = true
    if (st.note) {
      emit('note-off', st.note)
      st.note = null
    }
  }
  if (!st.panActive) return
  const scroller = scrollRef.value
  if (!scroller) return
  scroller.scrollLeft = st.startScroll - dx
  emit('scroll')
}

function onStripPointerUp(e: PointerEvent): void {
  const st = pointers.get(e.pointerId)
  if (!st) return
  pointers.delete(e.pointerId)
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
