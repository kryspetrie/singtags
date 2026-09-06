<script setup lang="ts">
/**
 * Choose sheets / tracks / everything when queueing selected catalog tags.
 */
import type { QueueDownloadMode } from '../lib/queueSelectedTags'

defineProps<{
  open: boolean
  count: number
}>()

const emit = defineEmits<{
  close: []
  choose: [mode: QueueDownloadMode]
}>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="mode-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="queue-download-mode-title"
      tabindex="-1"
      @keydown.escape.prevent="emit('close')"
    >
      <button type="button" class="backdrop" aria-label="Cancel" @click="emit('close')" />
      <div class="panel">
        <h2 id="queue-download-mode-title" class="title">Queue Downloads</h2>
        <p class="message">
          Add files from {{ count }} selected tag{{ count === 1 ? '' : 's' }} to the download queue.
        </p>
        <div class="choices">
          <button type="button" class="btn btn-primary" @click="emit('choose', 'all')">
            Everything
          </button>
          <button type="button" class="btn" @click="emit('choose', 'sheets')">
            Sheets only
          </button>
          <button type="button" class="btn" @click="emit('choose', 'tracks')">
            Tracks only
          </button>
        </div>
        <button type="button" class="btn btn-ghost cancel" @click="emit('close')">Cancel</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.mode-root {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
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
.panel {
  position: relative;
  z-index: 1;
  width: min(22rem, 100%);
  display: grid;
  gap: 0.85rem;
  padding: 1.1rem 1.15rem 1.15rem;
  border-radius: var(--radius, 12px);
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  line-height: 1.25;
}
.message {
  margin: 0;
  color: var(--muted);
  font-size: 0.95rem;
  line-height: 1.45;
}
.choices {
  display: grid;
  gap: 0.5rem;
}
.btn {
  min-height: 44px;
  padding: 0.45rem 0.9rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
}
.btn:hover {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}
.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.btn-ghost {
  background: transparent;
  border: none;
  color: var(--muted);
  font-weight: 600;
}
.cancel {
  justify-self: end;
  min-height: 40px;
}
</style>
