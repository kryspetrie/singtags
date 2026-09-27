/**
 * Orphan — Coach no longer has a Pillars page. Kept as copy reference only.
 * Pillars are defined on Sketch (Alt+click / ◆ / dock Pillar).
 */
defineEmits<{
  nextRoles: []
}>()
</script>

<template>
  <section class="panel">
    <p class="hint">
      Mark phrase chords as <strong>pillars</strong> on the <strong>Sketch</strong> lane:
      Alt+click a chord, click its ◆ badge, or open it and press <strong>Pillar</strong>.
      Pillars paint green and drive Coach home-roots. Detected “Lock” promotes holes as pillars.
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
