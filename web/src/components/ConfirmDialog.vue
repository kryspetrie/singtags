<script setup lang="ts">
/**
 * Modal confirm/cancel dialog teleported to `body` (destructive actions, unfavorite, clear cache).
 */
defineProps<{
  /** Modal visibility. */
  open: boolean
  title: string
  message: string
  /** Primary action label (destructive by default). */
  confirmLabel?: string
  cancelLabel?: string
  /** Accent styling for the confirm button (default: danger). */
  danger?: boolean
}>()

const emit = defineEmits<{
  close: []
  confirm: []
}>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="confirm-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      tabindex="-1"
      @keydown.escape.prevent="emit('close')"
    >
      <button type="button" class="backdrop" aria-label="Cancel" @click="emit('close')" />
      <div class="panel">
        <h2 id="confirm-dialog-title" class="title">{{ title }}</h2>
        <p class="message">{{ message }}</p>
        <slot />
        <div class="actions">
          <button type="button" class="btn" @click="emit('close')">
            {{ cancelLabel || 'Cancel' }}
          </button>
          <button
            type="button"
            class="btn"
            :class="danger === false ? 'btn-primary' : 'btn-danger'"
            @click="emit('confirm')"
          >
            {{ confirmLabel || 'Confirm' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-root {
  position: fixed;
  inset: 0;
  z-index: 60;
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
  white-space: pre-line;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
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
}
.btn:hover {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}
.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.btn-danger {
  background: color-mix(in srgb, var(--danger, #9b2c2c) 12%, var(--surface));
  border-color: color-mix(in srgb, var(--danger, #9b2c2c) 45%, var(--border));
  color: var(--danger, #9b2c2c);
}
.btn-danger:hover {
  background: color-mix(in srgb, var(--danger, #9b2c2c) 18%, var(--surface));
}
</style>
