<script setup lang="ts">
/**
 * Full-panel Coach help for the active guided step.
 */
defineProps<{
  title: string
  tip: string
  detail: string
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <section class="help-panel" aria-label="Coach help">
    <header class="head">
      <h3>{{ title }}</h3>
      <button type="button" class="close" aria-label="Close" title="Close" @click="emit('close')">
        ×
      </button>
    </header>
    <p class="tip">{{ tip }}</p>
    <p class="detail">{{ detail }}</p>
  </section>
</template>

<style scoped>
.help-panel {
  display: grid;
  gap: 0.55rem;
  align-content: start;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 0.55rem 0.65rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 5%, transparent);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}
h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 750;
}
.close {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  min-width: 1.7rem;
  min-height: 1.7rem;
  cursor: pointer;
  font: inherit;
  line-height: 1;
}
.tip {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 650;
  line-height: 1.4;
  color: var(--text);
}
.detail {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--muted);
}
</style>
