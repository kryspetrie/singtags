<script setup lang="ts">
defineProps<{
  open: boolean
  title: string
}>()

defineEmits<{
  close: []
}>()
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="sheet-root" role="dialog" aria-modal="true" :aria-label="title">
      <button type="button" class="backdrop" aria-label="Close" @click="$emit('close')" />
      <div class="panel">
        <header class="head">
          <h2>{{ title }}</h2>
          <button type="button" class="btn btn-ghost" @click="$emit('close')">Done</button>
        </header>
        <div class="body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet-root {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(0, 0, 0, 0.35);
}
.panel {
  position: relative;
  max-height: min(70vh, 28rem);
  background: var(--surface);
  border-radius: 16px 16px 0 0;
  padding: 0.75rem 1rem calc(1rem + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.12);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.head h2 {
  margin: 0;
  font-size: 1.05rem;
  font-family: var(--font-display);
}
.body {
  overflow: auto;
  -webkit-overflow-scrolling: touch;
}
@media (min-width: 768px) {
  .sheet-root {
    justify-content: center;
    align-items: center;
    padding: 1rem;
  }
  .panel {
    width: min(420px, 100%);
    max-height: 70vh;
    border-radius: var(--radius);
    padding-bottom: 1rem;
  }
}
</style>
