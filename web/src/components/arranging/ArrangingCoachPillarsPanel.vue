<script setup lang="ts">
/**
 * Orphan — Coach no longer has a Pillars page. Kept as copy reference only.
 * Homes come from Strong vs passing melody + Sketch chords (not manual ◆ tags).
 */
defineEmits<{
  nextRoles: []
}>()
</script>

<template>
  <section class="panel">
    <p class="hint">
      Coach home roots follow <strong>Strong</strong> vs <strong>passing</strong> Lead
      notes and the chords you paint on <strong>Sketch</strong>. Detected
      <strong>Lock</strong> promotes hole guesses into Sketch — no separate pillar tags.
    </p>
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
</style>
