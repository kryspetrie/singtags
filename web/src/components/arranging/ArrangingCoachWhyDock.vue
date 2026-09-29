<script setup lang="ts">
/**
 * Secondary Coach dock: Why? ranking explanation for the selected candidate.
 */
import type { CandidateWhyView } from '../../application/arranging/CandidateWhy'
import ArrangingCandidateWhy from './ArrangingCandidateWhy.vue'

defineProps<{
  why: CandidateWhyView
  showNumbers: boolean
  chordLabel?: string | null
}>()

const emit = defineEmits<{
  close: []
  'update:showNumbers': [value: boolean]
}>()
</script>

<template>
  <aside class="why-dock" aria-label="Why this ranking">
    <header class="head">
      <div class="titles">
        <h3>Why?</h3>
        <p v-if="chordLabel" class="chord">{{ chordLabel }}</p>
      </div>
      <button type="button" class="close" aria-label="Close Why" title="Close" @click="emit('close')">
        ×
      </button>
    </header>
    <div class="body">
      <ArrangingCandidateWhy
        :why="why"
        :show-numbers="showNumbers"
        @update:show-numbers="emit('update:showNumbers', $event)"
      />
    </div>
  </aside>
</template>

<style scoped>
.why-dock {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 0 0 auto;
  width: min(16.5rem, 42vw);
  min-width: 13rem;
  height: 100%;
  padding: 0.5rem 0.55rem 0.65rem;
  border-left: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 96%, var(--bg));
  overflow: hidden;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.35rem;
  flex: 0 0 auto;
}
.titles {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}
h3 {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 750;
}
.chord {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 650;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.close {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  min-width: 1.7rem;
  min-height: 1.7rem;
  cursor: pointer;
  font: inherit;
  line-height: 1;
  flex-shrink: 0;
}
.body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
</style>
