<script setup lang="ts">
/**
 * Coach dock header — Tweaks / ideas / help open as full-panel modes in the parent.
 */
defineProps<{
  showConfig: boolean
  showIdeas: boolean
  showHelp: boolean
}>()

const emit = defineEmits<{
  toggleConfig: []
  toggleIdeas: []
  toggleHelp: []
  popOut: []
  close: []
}>()
</script>

<template>
  <header class="dock-head">
    <h2 class="dock-title">Coach</h2>
    <div class="head-actions">
      <button
        type="button"
        class="text-btn"
        title="Craft ideas for this step"
        :aria-pressed="showIdeas"
        @click="emit('toggleIdeas')"
      >
        Ideas
      </button>
      <button
        type="button"
        class="text-btn"
        title="How to use this step"
        :aria-pressed="showHelp"
        @click="emit('toggleHelp')"
      >
        Help
      </button>
      <button
        type="button"
        class="text-btn"
        title="Tweaks — contest rules, temperament, cadence bias, validations"
        aria-label="Tweaks"
        :aria-pressed="showConfig"
        @click="emit('toggleConfig')"
      >
        Tweaks
      </button>
      <button type="button" class="text-btn" title="Pop out" @click="emit('popOut')">Pop out</button>
      <button type="button" class="icon-btn" aria-label="Close coach" @click="emit('close')">
        x
      </button>
    </div>
  </header>
</template>

<style scoped>
.dock-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  flex: 0 0 auto;
}
.dock-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 750;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.text-btn,
.icon-btn {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
  min-height: 1.7rem;
  line-height: 1;
}
.text-btn {
  padding: 0 0.45rem;
  font-size: 0.72rem;
  font-weight: 700;
}
.text-btn[aria-pressed='true'],
.icon-btn[aria-pressed='true'] {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}
.icon-btn {
  min-width: 1.7rem;
}
</style>
