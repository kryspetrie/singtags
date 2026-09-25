<script setup lang="ts">
/**
 * Pillars step — assign structural home-roots on Sketch / Detected lanes.
 */
defineEmits<{
  nextRoles: []
}>()
</script>

<template>
  <section class="panel">
    <p class="hint">
      Mark phrase chords as <strong>pillars</strong> on the <strong>Sketch</strong> or
      <strong>Detected</strong> lane (open a chord → <strong>Pillar</strong>). Pillars paint in a
      distinct color and drive Coach home-roots. Detected “Lock all” promotes holes as pillars.
    </p>
    <p class="muted tiny">
      Coach Propose still drafts on the Coach lane until Lock; Lock writes pillars into Sketch.
    </p>
    <div class="row">
      <button
        type="button"
        class="step-btn"
        title="Open Assign Note Roles on the piano roll"
        @click="$emit('nextRoles')"
      >
        Next: Note roles →
      </button>
    </div>
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
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}
.step-btn {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0.28rem 0.55rem;
  color: var(--text);
}
.muted {
  color: var(--muted);
}
.tiny {
  font-size: 0.75rem;
  margin: 0;
}
</style>
