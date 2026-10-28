<script setup lang="ts">
/**
 * Coach Home — intended Tag Studio + Coach workflow (landing page).
 */
defineEmits<{
  continue: []
}>()
</script>

<template>
  <section class="landing" aria-label="Coach workflow">
    <h3 class="title">How to use Coach</h3>
    <p class="lead">
      Auto Coach needs the Lead and a key. Walk Chords, then Check, Optimize, and Polish.
      Help opens the walkthrough beside this dock when you want it.
    </p>

    <button type="button" class="primary" @click="$emit('continue')">
      Continue to Chords
    </button>
  </section>
</template>

<style scoped>
.landing {
  display: grid;
  gap: 0.75rem;
  padding: 0.15rem 0.1rem 0.5rem;
}
.title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 750;
}
.lead {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.45;
  color: var(--text);
}
.primary {
  justify-self: start;
  margin-top: 0.15rem;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--text);
  font: inherit;
  font-weight: 700;
  padding: 0.45rem 0.85rem;
  cursor: pointer;
}
.primary:hover {
  background: color-mix(in srgb, var(--accent) 24%, transparent);
}
</style>
