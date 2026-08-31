<script setup lang="ts">
/** Centered empty-state panel with optional message slot for list views. */
defineProps<{
  /** Primary empty-state heading. */
  title: string
  message?: string
  tone?: 'muted' | 'danger'
}>()
</script>

<template>
  <div class="empty" :data-tone="tone ?? 'muted'" role="status">
    <p class="title">{{ title }}</p>
    <p v-if="message" class="msg">{{ message }}</p>
    <slot />
  </div>
</template>

<style scoped>
.empty {
  padding: 1.25rem 1rem;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--surface) 80%, transparent);
  text-align: center;
}
.title {
  margin: 0;
  font-weight: 600;
}
.msg {
  margin: 0.35rem 0 0;
  color: var(--muted);
  font-size: 0.95rem;
}
.empty[data-tone='danger'] .title {
  color: var(--danger);
}
</style>
