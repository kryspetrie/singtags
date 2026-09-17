<script setup lang="ts">
/**
 * Horizontal piano viewport: the keys themselves are the scroller.
 *
 * Unlocked: press sounds a note; drag past a distance pans the keyboard and
 * silences that note (even if the press started on a key).
 * Locked: drag-to-pan is off; dragging across keys glissandos (each key sounds).
 */
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Freeze scrollLeft — ignore drag-to-pan (mobile “lock position”). */
    lockPosition?: boolean
  }>(),
  { lockPosition: false },
)

const emit = defineEmits<{
  'note-on': [note: string]
  'note-off': [note: string]
  scroll: []
}>()

const scrollRef = ref<HTMLElement | null>(null)

/** Horizontal drag past this (and mostly horizontal) → pan when unlocked. */
const PAN_THRESHOLD_PX = 28

type StripPointer = {
  note: string | null
  startX: number
  startY: number
  startScroll: number
  panActive: boolean
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

function setPointerNote(st: StripPointer, next: string | null): void {
  if (st.note === next) return
  if (st.note) emit('note-off', st.note)
  st.note = next
  if (next) emit('note-on', next)
}

function silencePointerNote(st: StripPointer): void {
  if (!st.note) return
  emit('note-off', st.note)
  st.note = null
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
  }
  pointers.set(e.pointerId, st)
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  if (note) emit('note-on', note)
}

function onStripPointerMove(e: PointerEvent): void {
  const st = pointers.get(e.pointerId)
  if (!st) return

  if (st.panActive) {
    const scroller = scrollRef.value
    if (!scroller) return
    scroller.scrollLeft = st.startScroll - (e.clientX - st.startX)
    emit('scroll')
    return
  }

  // Locked: glissando across keys; never pan.
  if (props.lockPosition) {
    setPointerNote(st, noteAtClientPoint(e.clientX, e.clientY))
    return
  }

  const dx = e.clientX - st.startX
  const dy = e.clientY - st.startY
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)

  // Unlocked: enough horizontal drag → stop the note and pan the strip.
  if (adx >= PAN_THRESHOLD_PX && adx > ady * 1.35) {
    st.panActive = true
    silencePointerNote(st)
    const scroller = scrollRef.value
    if (!scroller) return
    scroller.scrollLeft = st.startScroll - dx
    emit('scroll')
    return
  }

  // Below pan threshold: keep the original pressed note (no glissando while unlocked).
}

function onStripPointerUp(e: PointerEvent): void {
  const st = pointers.get(e.pointerId)
  if (!st) return
  pointers.delete(e.pointerId)
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
    :class="{ locked: lockPosition }"
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
.piano-h-scroller.locked {
  overflow-x: hidden;
  cursor: default;
  touch-action: none;
}
.piano-h-scroller.locked:active {
  cursor: default;
}
.piano-h-scroller::-webkit-scrollbar {
  display: none;
}
</style>
