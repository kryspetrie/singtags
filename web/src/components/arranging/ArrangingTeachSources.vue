<script setup lang="ts">
/**
 * Compact Sources row for Learn lessons / teach asides.
 */
import { computed } from 'vue'
import { asciiMusicText } from '../../lib/arranging/asciiMusicText'

const props = defineProps<{
  /** Preformatted cite lines ("Label — detail") or plain labels. */
  items: readonly string[]
  label?: string
}>()

const cites = computed(() => props.items.map((s) => s.trim()).filter(Boolean))
</script>

<template>
  <div v-if="cites.length" class="teach-sources" aria-label="Sources">
    <span class="sources-label">{{ label || 'Sources' }}</span>
    <ul class="sources-list">
      <li v-for="(c, i) in cites" :key="`${i}-${c}`" class="source-chip">
        {{ asciiMusicText(c) }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.teach-sources {
  display: grid;
  gap: 0.28rem;
}
.sources-label {
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.sources-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.28rem;
}
.source-chip {
  margin: 0;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 88%, var(--accent));
  font-size: 0.68rem;
  line-height: 1.35;
  color: color-mix(in srgb, var(--muted) 70%, var(--text));
  max-width: 100%;
}
</style>
