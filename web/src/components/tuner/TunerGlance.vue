<script setup lang="ts">
/**
 * Solo Tune Glance — distance-first wash + status word. No cents / no strobe.
 */
defineProps<{
  statusWord: 'IN TUNE' | 'SHARP' | 'FLAT' | 'WAIT'
  noteName: string | null
}>()

defineEmits<{
  exit: []
}>()
</script>

<template>
  <div
    class="glance"
    :data-status="statusWord"
    role="dialog"
    aria-modal="true"
    aria-label="Tuner rehearsal view"
  >
    <p class="word">{{ statusWord }}</p>
    <p v-if="noteName" class="note">{{ noteName }}</p>
    <button type="button" class="exit" @click="$emit('exit')">Exit rehearsal</button>
  </div>
</template>

<style scoped>
.glance {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-content: center;
  gap: 0.75rem;
  padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
    max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
  background: var(--bg);
  text-align: center;
}
.glance[data-status='IN TUNE'] {
  background: color-mix(in srgb, var(--accent) 28%, var(--bg));
}
.glance[data-status='SHARP'],
.glance[data-status='FLAT'] {
  background: color-mix(in srgb, var(--danger, #b33) 22%, var(--bg));
}
.glance[data-status='WAIT'] {
  background: color-mix(in srgb, var(--muted) 18%, var(--bg));
}
.word {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 800;
  letter-spacing: 0.08em;
  font-size: clamp(2.75rem, 14vh, 6rem);
  line-height: 1;
  color: var(--text);
  text-shadow: 0 0 0 1px var(--border);
}
.note {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 6vh, 2.75rem);
  font-weight: 700;
  color: var(--text);
  opacity: 0.85;
}
.exit {
  margin-top: 1.25rem;
  min-height: 48px;
  min-width: 12rem;
  padding: 0.65rem 1.25rem;
  border-radius: 10px;
  border: 2px solid var(--text);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 700;
  font-size: 1.05rem;
  cursor: pointer;
  justify-self: center;
}
</style>
