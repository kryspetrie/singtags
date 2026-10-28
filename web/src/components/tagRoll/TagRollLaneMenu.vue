<script setup lang="ts">
/**
 * Options popout for a bottom lane. New lane settings go in this panel
 * instead of another gutter button. The panel is teleported so the stage's
 * overflow does not clip it.
 */
import { nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Accessible name, for example "Detect options". */
    label?: string
  }>(),
  { label: 'Lane options' },
)

const open = ref(false)
const btnRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})
const panelId = useId()

function place(): void {
  const btn = btnRef.value
  if (!btn) return
  const rect = btn.getBoundingClientRect()
  const width = Math.min(272, window.innerWidth - 16)
  const margin = 8
  let left = rect.left
  if (left + width > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - margin - width)
  }
  const spaceAbove = rect.top - margin
  const spaceBelow = window.innerHeight - rect.bottom - margin
  const openAbove = spaceBelow < 240 && spaceAbove > spaceBelow
  const maxHeight = Math.max(120, (openAbove ? spaceAbove : spaceBelow) - 8)
  panelStyle.value = openAbove
    ? {
        left: `${left}px`,
        bottom: `${window.innerHeight - rect.top + 6}px`,
        width: `${width}px`,
        maxHeight: `${maxHeight}px`,
      }
    : {
        left: `${left}px`,
        top: `${rect.bottom + 6}px`,
        width: `${width}px`,
        maxHeight: `${maxHeight}px`,
      }
}

async function toggle(): Promise<void> {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    place()
  }
}

function close(): void {
  open.value = false
}

function onDocPointerDown(ev: Event): void {
  if (!open.value) return
  const target = ev.target
  if (!(target instanceof Node)) return
  if (btnRef.value?.contains(target)) return
  if (panelRef.value?.contains(target)) return
  close()
}

function onKey(ev: KeyboardEvent): void {
  if (open.value && ev.key === 'Escape') close()
}

function onViewport(): void {
  if (open.value) place()
}

watch(open, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  place()
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true)
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', onViewport)
  window.addEventListener('scroll', onViewport, true)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onViewport)
  window.removeEventListener('scroll', onViewport, true)
})
</script>

<template>
  <button
    ref="btnRef"
    type="button"
    class="lane-opt-btn"
    :class="{ open }"
    :aria-label="props.label"
    :aria-expanded="open"
    :aria-controls="open ? panelId : undefined"
    :title="props.label"
    @click.stop="toggle"
  >
    Options
  </button>
  <Teleport to="body">
    <div
      v-if="open"
      :id="panelId"
      ref="panelRef"
      class="lane-opt-panel"
      role="dialog"
      :aria-label="props.label"
      :style="panelStyle"
    >
      <slot />
    </div>
  </Teleport>
</template>

<style scoped>
.lane-opt-btn {
  width: 100%;
  max-width: 100%;
  padding: 0.1rem 0.2rem;
  min-height: 1.35rem;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor: pointer;
}
.lane-opt-btn.open,
.lane-opt-btn:hover {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
}
.lane-opt-panel {
  position: fixed;
  z-index: 96;
  overflow: auto;
  box-sizing: border-box;
  padding: 0.7rem 0.75rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 12px 32px color-mix(in srgb, var(--text) 18%, transparent);
}
</style>
