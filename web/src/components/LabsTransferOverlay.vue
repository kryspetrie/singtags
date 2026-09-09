<script setup lang="ts">
/**
 * Fullscreen stage for Labs transfer send/receive (Wireless, OS Share).
 * Same Teleport / Esc / Stop chrome pattern as optical overlays.
 */
import { onUnmounted, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    status?: string
    error?: string | null
    stopLabel?: string
  }>(),
  {
    status: '',
    error: null,
    stopLabel: 'Stop',
  },
)

const emit = defineEmits<{
  stop: []
}>()

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    emit('stop')
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKey)
    else window.removeEventListener('keydown', onKey)
  },
)

onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-show="open"
      class="labs-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
    >
      <div class="labs-chrome" role="toolbar" aria-label="Transfer controls">
        <h2 class="labs-title">{{ title }}</h2>
        <div class="labs-chrome-actions">
          <slot name="chrome" />
          <button type="button" class="chrome-btn stop-btn" @click="emit('stop')">
            {{ stopLabel }}
          </button>
        </div>
      </div>

      <div v-if="$slots.intents" class="labs-intents">
        <slot name="intents" />
      </div>

      <div class="labs-stage">
        <slot />
      </div>

      <div class="labs-footer">
        <p v-if="error" class="labs-err" role="alert">{{ error }}</p>
        <p v-else class="labs-status" role="status">{{ status }}</p>
        <div v-if="$slots.footer" class="labs-footer-extra">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.labs-overlay {
  position: fixed;
  inset: 0;
  z-index: 140;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 0.45rem;
  padding: max(0.65rem, env(safe-area-inset-top)) max(0.65rem, env(safe-area-inset-right))
    max(0.65rem, env(safe-area-inset-bottom)) max(0.65rem, env(safe-area-inset-left));
  background: #0a0a0a;
  color: #fff;
}
.labs-chrome {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  justify-content: space-between;
}
.labs-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.labs-chrome-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  margin-left: auto;
}
.chrome-btn {
  min-height: 40px;
  padding: 0.35rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}
.stop-btn {
  border-color: rgba(255, 120, 120, 0.55);
  background: rgba(180, 40, 40, 0.35);
}
.labs-intents {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.labs-stage {
  min-height: 0;
  display: grid;
  place-items: center;
  overflow: auto;
}
.labs-footer {
  display: grid;
  gap: 0.45rem;
}
.labs-status,
.labs-err {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.4;
  text-align: center;
}
.labs-err {
  color: #ffb4b4;
}
.labs-status {
  opacity: 0.9;
}
.labs-footer-extra {
  display: grid;
  gap: 0.45rem;
  justify-items: center;
}
</style>
