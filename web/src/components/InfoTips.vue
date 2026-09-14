<script setup lang="ts">
/**
 * Compact “i” tips control matching Browse search tips (toggle + hover on desktop).
 * Popover flips to end-align when there isn’t room to the right (mobile-safe).
 */
import { nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue'

withDefaults(
  defineProps<{
    /** Accessible name for the button. */
    label?: string
    /** Native tooltip on the button. */
    title?: string
  }>(),
  {
    label: 'More information',
    title: 'More information',
  },
)

const open = ref(false)
const alignEnd = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const popoverId = useId()

function updatePlacement(): void {
  const el = rootEl.value
  if (!el || typeof window === 'undefined') return
  const rect = el.getBoundingClientRect()
  const margin = 16
  const maxW = Math.min(22 * 16, window.innerWidth - margin * 2)
  const spaceRight = window.innerWidth - rect.left - margin
  alignEnd.value = spaceRight < maxW
}

async function toggle(): Promise<void> {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    updatePlacement()
  }
}

function close(): void {
  open.value = false
}

function onDocPointerDown(ev: Event): void {
  if (!open.value) return
  const t = ev.target
  if (t instanceof Element && t.closest('.info-tips')) return
  open.value = false
}

function onViewportChange(): void {
  if (open.value) updatePlacement()
}

watch(open, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  updatePlacement()
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('orientationchange', onViewportChange)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('orientationchange', onViewportChange)
})
</script>

<template>
  <div
    ref="rootEl"
    class="info-tips"
    :class="{ open, 'align-end': alignEnd }"
    @mouseleave="close"
    @mouseenter="updatePlacement"
  >
    <button
      type="button"
      class="info-tips-btn"
      :aria-label="label"
      :aria-expanded="open"
      :aria-controls="popoverId"
      :title="title"
      @click.stop="toggle"
    >
      i
    </button>
    <div :id="popoverId" class="info-tips-overlay" role="tooltip">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.info-tips {
  position: relative;
  z-index: 5;
  display: inline-flex;
  flex-shrink: 0;
}
.info-tips-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border, #ccc);
  border-radius: 999px;
  background: var(--surface, #fff);
  color: var(--muted);
  font-family: Georgia, 'Times New Roman', serif;
  font-style: italic;
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}
.info-tips-btn:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--border) 35%, transparent);
}
.info-tips-overlay {
  display: none;
  position: absolute;
  left: 0;
  right: auto;
  top: calc(100% + 0.35rem);
  z-index: 20;
  width: min(22rem, calc(100vw - 2rem));
  max-width: calc(100vw - 2rem);
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.16);
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--muted);
  text-align: left;
  font-style: normal;
  font-weight: 400;
  font-family: inherit;
  box-sizing: border-box;
}
.info-tips.align-end .info-tips-overlay {
  left: auto;
  right: 0;
}
.info-tips.open .info-tips-overlay {
  display: block;
}
@media (hover: hover) {
  .info-tips:hover .info-tips-overlay,
  .info-tips:focus-within .info-tips-overlay {
    display: block;
  }
}
.info-tips-overlay :deep(p) {
  margin: 0;
}
.info-tips-overlay :deep(p + p),
.info-tips-overlay :deep(ol),
.info-tips-overlay :deep(ul) {
  margin-top: 0.45rem;
}
.info-tips-overlay :deep(ol),
.info-tips-overlay :deep(ul) {
  margin-bottom: 0;
  padding-left: 1.15rem;
}
.info-tips-overlay :deep(li + li) {
  margin-top: 0.25rem;
}
.info-tips-overlay :deep(strong) {
  color: var(--text);
  font-weight: 650;
}
</style>
