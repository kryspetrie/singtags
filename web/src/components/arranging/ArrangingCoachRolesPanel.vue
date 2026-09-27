<script setup lang="ts">
/**
 * Coach step: open top-level Melody roles (toolbar).
 */
defineEmits<{
  openAssign: []
}>()
</script>

<template>
  <section class="panel">
    <p class="hint">
      Melody part and Strong / Passing live under toolbar <strong>Roles</strong> — one place for
      Harmonize, Detected, and Coach. Open Roles to label notes on the roll
      (<kbd>S</kbd> / <kbd>P</kbd> / <kbd>M</kbd>).
    </p>
    <button type="button" class="primary" @click="$emit('openAssign')">
      Open Melody roles
    </button>
  </section>
</template>

<style scoped>
.panel {
  display: grid;
  gap: 0.65rem;
}
.hint {
  margin: 0;
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.35;
}
kbd {
  font: inherit;
  font-weight: 700;
  font-size: 0.75rem;
  padding: 0.05rem 0.25rem;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.primary {
  border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0.35rem 0.65rem;
  color: var(--text);
  justify-self: start;
}
</style>
