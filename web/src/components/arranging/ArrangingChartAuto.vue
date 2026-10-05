<script setup lang="ts">
/**
 * Whole-chart Coach tools — Strengthen, path polish, swipe seeds.
 * (Local moment work stays on Chords; checklist stays on Polish.)
 */
defineProps<{
  status: string | null
  swipeAvailable: boolean
  canRunPathTools: boolean
}>()

const emit = defineEmits<{
  strengthen: []
  polish: []
  applySwipe: []
}>()
</script>

<template>
  <section class="auto" aria-label="Whole-chart tools">
    <h3 class="subh">Auto / whole chart</h3>
    <p class="hint">
      These passes touch the entire arrangement — not one moment. Run them after Chords and Check,
      then audition. Export lives on the Tag Studio toolbar, not in Coach.
    </p>
    <div class="row">
      <button
        type="button"
        class="btn"
        :disabled="!canRunPathTools"
        title="Improve weak approaches and secondary-dominant drives where safe"
        @click="emit('strengthen')"
      >
        Strengthen
      </button>
      <button
        type="button"
        class="btn primary"
        :disabled="!canRunPathTools"
        title="Revoice stacks along a global inversion path (voice leading + ring)"
        @click="emit('polish')"
      >
        Polish inversions
      </button>
      <button
        type="button"
        class="btn"
        :disabled="!swipeAvailable"
        title="Insert a short swipe embellishment on a long held melody note"
        @click="emit('applySwipe')"
      >
        Try swipe seed
      </button>
    </div>
    <p v-if="!canRunPathTools" class="meta warn">
      Need Sketch pillars and TTBB stacks before Strengthen / Polish inversions can run.
    </p>
    <p v-else-if="!swipeAvailable" class="meta">
      Swipe needs a long held melody note that already has a stack.
    </p>
    <p v-if="status" class="status" role="status">{{ status }}</p>
  </section>
</template>

<style scoped>
.auto {
  display: grid;
  gap: 0.4rem;
}
.hint {
  margin: 0;
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.35;
}
.subh {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.btn {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 650;
  cursor: pointer;
  min-height: 1.8rem;
  padding: 0.2rem 0.5rem;
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn.primary {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.meta {
  margin: 0;
  font-size: 0.72rem;
  color: var(--muted);
  line-height: 1.35;
}
.meta.warn {
  color: color-mix(in srgb, #a15c12 70%, var(--muted));
}
.status {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 650;
  color: var(--text);
  line-height: 1.35;
}
</style>
