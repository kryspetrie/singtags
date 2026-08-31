<script setup lang="ts">
/**
 * Offline library audio pack part picker (all parts, mix only, or custom subset).
 */
import { COMMON_AUDIO_PARTS, partLabel, type LibraryAudioPartsMode } from '../lib/audioParts'

defineProps<{
  /** Offline audio pack part selection mode. */
  mode: LibraryAudioPartsMode
  /** Selected part ids when `mode === 'custom'`. */
  selected: string[]
}>()

const emit = defineEmits<{
  'update:mode': [LibraryAudioPartsMode]
  togglePart: [string]
}>()
</script>

<template>
  <fieldset class="parts-field">
    <legend class="legend">Tracks to cache</legend>
    <div class="mode-row">
      <label class="mode-opt">
        <input
          type="radio"
          name="library-parts-mode"
          value="all"
          :checked="mode === 'all'"
          @change="emit('update:mode', 'all')"
        />
        All parts
      </label>
      <label class="mode-opt">
        <input
          type="radio"
          name="library-parts-mode"
          value="mix"
          :checked="mode === 'mix'"
          @change="emit('update:mode', 'mix')"
        />
        Mix only
      </label>
      <label class="mode-opt">
        <input
          type="radio"
          name="library-parts-mode"
          value="custom"
          :checked="mode === 'custom'"
          @change="emit('update:mode', 'custom')"
        />
        Pick parts
      </label>
    </div>
    <div v-if="mode === 'custom'" class="part-chips" role="group" aria-label="Learning track parts">
      <button
        v-for="part in COMMON_AUDIO_PARTS"
        :key="part"
        type="button"
        class="chip"
        :class="{ on: selected.includes(part) }"
        :aria-pressed="selected.includes(part)"
        @click="emit('togglePart', part)"
      >
        {{ partLabel(part) }}
      </button>
    </div>
    <p v-if="mode === 'mix'" class="hint">Downloads only the mixed learning track for each tag.</p>
    <p v-else-if="mode === 'custom' && !selected.length" class="warn">Select at least one part.</p>
  </fieldset>
</template>

<style scoped>
.parts-field {
  margin: 0 0 0.85rem;
  padding: 0;
  border: 0;
}
.legend {
  font-weight: 600;
  font-size: 0.92rem;
  margin-bottom: 0.45rem;
}
.mode-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem 1rem;
  margin-bottom: 0.55rem;
}
.mode-opt {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.92rem;
  font-weight: 600;
}
.part-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.chip {
  min-height: 40px;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--muted);
}
.chip.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  color: var(--accent-hover);
}
.hint {
  margin: 0.35rem 0 0;
  font-size: 0.88rem;
  color: var(--muted);
  line-height: 1.4;
}
.warn {
  margin: 0.35rem 0 0;
  font-size: 0.88rem;
  color: var(--danger, #b42318);
}
</style>
