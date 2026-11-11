<script setup lang="ts">
/**
 * Chord stack Detail — lane canvas (Assisted / Conditional) + beat scope.
 */
import type { ChordStackScore } from '../../domain/tuner/chordStack'
import type { ChordToneRow } from '../../composables/useTunerChordSession'
import ChordStackCanvas from './ChordStackCanvas.vue'
import ChordBeatScope from './ChordBeatScope.vue'

withDefaults(
  defineProps<{
    score: ChordStackScore | null
    rows: ChordToneRow[]
    clarity?: number
    windowCents?: number
    peaksHz?: number[]
    a4Hz?: number
    active?: boolean
    reducedMotion?: boolean
  }>(),
  { windowCents: 5, peaksHz: () => [], a4Hz: 440, active: true, reducedMotion: false },
)
</script>

<template>
  <section class="stack" aria-label="Chord stack">
    <p v-if="score?.assistedPinRequired" class="assist" role="status">
      Assisted — pin nature and root in Settings before Locked/Fix colors appear.
    </p>
    <ChordStackCanvas
      :score="score"
      :rows="rows"
      :clarity="clarity"
      :window-cents="windowCents"
    />
    <ChordBeatScope
      :score="score"
      :peaks-hz="peaksHz"
      :a4-hz="a4Hz"
      :window-cents="windowCents"
      :active="active"
      :reduced-motion="reducedMotion"
    />
  </section>
</template>

<style scoped>
.stack {
  display: grid;
  gap: 0.65rem;
}
.assist {
  margin: 0;
  font-size: 0.9rem;
  padding: 0.5rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  color: var(--text);
}
</style>
