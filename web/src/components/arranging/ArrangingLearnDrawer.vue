<script setup lang="ts">
/**
 * Learning drawer — opens to the left of a right-side dock.
 * Full screen lifts the same note into a modal.
 */
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  title: string
  section?: string
  sections?: readonly { id: string; label: string; disabled?: boolean }[]
}>()

const emit = defineEmits<{
  close: []
  'update:section': [id: string]
  back: []
}>()

const fullscreen = ref(false)
const narrow = ref(false)
const hostEl = ref<HTMLElement | null>(null)
const frameStyle = ref<Record<string, string>>({})
let narrowQuery: MediaQueryList | null = null
let shellObserver: ResizeObserver | null = null

function placeDocked(): void {
  if (!props.open || fullscreen.value) {
    frameStyle.value = {}
    return
  }
  const shell = hostEl.value?.closest('.coach-shell')
  if (!(shell instanceof HTMLElement)) return
  const rect = shell.getBoundingClientRect()
  const width = Math.min(28 * 16, Math.max(16 * 16, window.innerWidth * 0.36))
  const room = Math.max(0, rect.left - 8)
  const overlap = Math.max(0, width - room)
  frameStyle.value = {
    position: 'fixed',
    top: `${rect.top}px`,
    height: `${rect.height}px`,
    width: `${width}px`,
    left: `${Math.max(8, rect.left - width + overlap)}px`,
    right: 'auto',
    bottom: 'auto',
    zIndex: '90',
  }
}

function watchShell(): void {
  shellObserver?.disconnect()
  const shell = hostEl.value?.closest('.coach-shell')
  if (!(shell instanceof HTMLElement) || typeof ResizeObserver === 'undefined') return
  shellObserver = new ResizeObserver(() => placeDocked())
  shellObserver.observe(shell)
}

function readNarrow(): boolean {
  return window.matchMedia('(max-width: 900px)').matches
}

function syncNarrow(): void {
  narrow.value = readNarrow()
  if (narrow.value && props.open) fullscreen.value = true
}

watch(
  () => props.open,
  (on) => {
    if (!on) fullscreen.value = false
    else if (readNarrow()) fullscreen.value = true
    void nextTick(() => {
      watchShell()
      placeDocked()
    })
  },
)

watch(fullscreen, () => {
  void nextTick(() => placeDocked())
})

onMounted(() => {
  narrowQuery = window.matchMedia('(max-width: 900px)')
  syncNarrow()
  narrowQuery.addEventListener('change', syncNarrow)
  window.addEventListener('resize', placeDocked)
  void nextTick(() => {
    watchShell()
    placeDocked()
  })
})
onUnmounted(() => {
  narrowQuery?.removeEventListener('change', syncNarrow)
  window.removeEventListener('resize', placeDocked)
  shellObserver?.disconnect()
})

function onEscape(): void {
  if (fullscreen.value) {
    fullscreen.value = false
    return
  }
  emit('close')
}
</script>

<template>
  <Teleport to="body" :disabled="!fullscreen">
    <div
      v-if="open"
      ref="hostEl"
      class="host"
      :class="{ modal: fullscreen }"
      @keydown.escape.prevent="onEscape"
    >
      <button
        v-if="fullscreen"
        type="button"
        class="backdrop"
        aria-label="Leave full screen"
        @click="fullscreen = false"
      />
      <aside
        class="learn-drawer"
        :class="{ 'modal-panel': fullscreen, docked: !fullscreen }"
        :style="fullscreen ? undefined : frameStyle"
        aria-label="Learning"
      >
        <header class="head">
          <h3>{{ title }}</h3>
          <div class="actions">
            <button
              v-if="!narrow"
              type="button"
              class="text"
              :title="fullscreen ? 'Dock beside the panel' : 'Full screen'"
              @click="fullscreen = !fullscreen"
            >
              {{ fullscreen ? 'Dock' : 'Full screen' }}
            </button>
            <button type="button" class="icon" aria-label="Close learning" title="Close" @click="emit('close')">
              ×
            </button>
          </div>
        </header>
        <div v-if="section === 'lesson'" class="back-row">
          <button type="button" @click="emit('back')">← Back</button>
        </div>
        <div
          v-else-if="sections?.length"
          class="tabs"
          role="tablist"
          aria-label="Learn"
        >
          <button
            v-for="item in sections"
            :key="item.id"
            type="button"
            role="tab"
            :aria-selected="section === item.id"
            :disabled="item.disabled"
            @click="emit('update:section', item.id)"
          >
            {{ item.label }}
          </button>
        </div>
        <div class="body">
          <slot />
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.learn-drawer {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 100%;
  z-index: 90;
  display: flex;
  flex-direction: column;
  width: min(24rem, 40vw);
  min-width: 16rem;
  border-left: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 97%, var(--bg));
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.4rem;
  flex: 0 0 auto;
  padding: 0.55rem 0.65rem 0.35rem;
}
h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 750;
  line-height: 1.3;
}
.actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex: 0 0 auto;
}
.text,
.icon {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}
.text {
  font-size: 0.72rem;
  min-height: 1.7rem;
  padding: 0.15rem 0.45rem;
}
.icon {
  min-width: 1.7rem;
  min-height: 1.7rem;
  line-height: 1;
}
.tabs {
  display: flex;
  gap: 0.25rem;
  flex: 0 0 auto;
  padding: 0 0.65rem 0.45rem;
}
.tabs button {
  flex: 1 1 0;
  min-height: 1.75rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
}
.tabs button[aria-selected='true'] {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}
.tabs button:disabled {
  opacity: 0.4;
  cursor: default;
}
.back-row {
  flex: 0 0 auto;
  padding: 0 0.65rem 0.4rem;
}
.back-row button {
  border: none;
  background: none;
  padding: 0;
  color: var(--accent, #0f6b5c);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 750;
  cursor: pointer;
}
.body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 0 0.65rem 0.75rem;
}
.learn-drawer:not(.modal-panel) .body {
  padding-bottom: 3.4rem;
}
.body :deep(.teach-panel-shell) {
  border: 0;
  background: transparent;
  padding: 0;
  overflow: visible;
}
.host {
  display: contents;
}
.host.modal {
  display: flex;
  position: fixed;
  inset: 0;
  z-index: 120;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  padding-bottom: calc(1rem + var(--bottom-nav-h, 3.75rem) + env(safe-area-inset-bottom));
}
.backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(0, 0, 0, 0.45);
  cursor: pointer;
}
.learn-drawer.modal-panel {
  position: relative;
  top: auto;
  right: auto;
  bottom: auto;
  z-index: 1;
  width: min(52rem, 100%);
  height: min(40rem, 100%);
  border-radius: var(--radius, 12px);
  border: 1px solid var(--border);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.modal-panel .head {
  padding: 0.85rem 1rem 0.4rem;
}
.modal-panel .body {
  padding: 0 1rem 1rem;
}
</style>
