<script setup lang="ts">
/**
 * Coach step: mark Lead notes as Strong (home) vs Passing (connective).
 */
import { computed } from 'vue'
import { midiToNote } from '../../audio/pianoSamples'
import {
  melodyRoleLongLabel,
  melodyRoleShortLabel,
} from '../../domain/arranging/melodyRoleLabels'
import { glossaryTitle } from '../../lib/arranging/glossaryTooltip'
import type { MelodyEvent, MelodyRole } from '../../domain/arranging/types'

const props = defineProps<{
  melody: readonly MelodyEvent[]
  selectedId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
  step: [dir: -1 | 1]
  setRole: [id: string, role: MelodyRole]
  labelAll: []
}>()

const selected = computed(
  () => props.melody.find((m) => m.id === props.selectedId) ?? null,
)

const labeledCount = computed(
  () => props.melody.filter((m) => m.role !== 'unknown').length,
)

const indexLabel = computed(() => {
  if (!props.melody.length) return '—'
  const i = props.melody.findIndex((m) => m.id === props.selectedId)
  return i >= 0 ? `${i + 1}/${props.melody.length}` : `—/${props.melody.length}`
})

const strongTip = glossaryTitle('pmn') || melodyRoleLongLabel('pmn')
const passingTip = glossaryTitle('smn') || melodyRoleLongLabel('smn')
</script>

<template>
  <section class="panel">
    <p class="hint">
      Mark each Lead note as a <strong>strong</strong> home tone or a <strong>passing</strong>
      connective tone. This steers which chords the coach prefers later — it is not the same as
      Pillars (home roots under phrases). To mark a tune handoff to another part: Ctrl/Cmd-click
      two notes on different parts, then <strong>Link melody pass</strong> under the roll.
    </p>
    <div class="row">
      <button
        type="button"
        class="primary"
        title="Guess Strong vs Passing from beat stress, length, and pillar tones. You can override any note."
        @click="emit('labelAll')"
      >
        Auto-label
      </button>
      <button
        type="button"
        class="step-btn"
        :disabled="!melody.length"
        title="Previous Lead melody note"
        @click="emit('step', -1)"
      >
        ← Note
      </button>
      <button
        type="button"
        class="step-btn"
        :disabled="!melody.length"
        title="Next Lead melody note"
        @click="emit('step', 1)"
      >
        Note →
      </button>
      <span class="meta">{{ indexLabel }} · {{ labeledCount }}/{{ melody.length }} labeled</span>
    </div>

    <div v-if="selected" class="card">
      <div class="note-line">
        <strong>{{ midiToNote(selected.midi) }}</strong>
        <span class="role-pill" :class="selected.role">{{ melodyRoleShortLabel(selected.role) }}</span>
      </div>
      <div class="row" role="group" aria-label="Melody note weight">
        <button
          type="button"
          class="step-btn"
          :class="{ on: selected.role === 'pmn' }"
          :title="strongTip"
          @click="emit('setRole', selected.id, 'pmn')"
        >
          Strong
        </button>
        <button
          type="button"
          class="step-btn"
          :class="{ on: selected.role === 'smn' }"
          :title="passingTip"
          @click="emit('setRole', selected.id, 'smn')"
        >
          Passing
        </button>
        <button
          type="button"
          class="step-btn"
          :class="{ on: selected.role === 'unknown' }"
          title="Clear the label so Auto-label (or you) can set it again"
          @click="emit('setRole', selected.id, 'unknown')"
        >
          Clear
        </button>
      </div>
    </div>
    <p v-else class="muted tiny">Select a Lead note on the roll, or step with ← Note / Note →.</p>

    <ul v-if="melody.length" class="note-list">
      <li v-for="(n, i) in melody" :key="n.id">
        <button
          type="button"
          class="note-btn"
          :class="{ on: n.id === selectedId }"
          :title="`${midiToNote(n.midi)} — ${melodyRoleLongLabel(n.role)}`"
          @click="emit('select', n.id)"
        >
          <span class="idx">{{ i + 1 }}</span>
          <strong>{{ midiToNote(n.midi) }}</strong>
          <span class="role-pill sm" :class="n.role">{{ melodyRoleShortLabel(n.role) }}</span>
        </button>
      </li>
    </ul>
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
.meta {
  font-size: 0.75rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.card {
  display: grid;
  gap: 0.45rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
}
.note-line {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.role-pill {
  font-size: 0.72rem;
  font-weight: 750;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--muted);
}
.role-pill.sm {
  font-size: 0.66rem;
  padding: 0.05rem 0.3rem;
}
.role-pill.pmn {
  color: #1f6b45;
  border-color: color-mix(in srgb, #2a8c5a 45%, var(--border));
  background: color-mix(in srgb, #2a8c5a 12%, transparent);
}
.role-pill.smn {
  color: #5b3d8f;
  border-color: color-mix(in srgb, #5b3d8f 40%, var(--border));
  background: color-mix(in srgb, #5b3d8f 10%, transparent);
}
.primary,
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
.primary {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  font-weight: 700;
}
.step-btn.on {
  border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  font-weight: 700;
}
.step-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.muted {
  color: var(--muted);
}
.tiny {
  font-size: 0.75rem;
  margin: 0;
}
.note-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.2rem;
  max-height: 12rem;
  overflow: auto;
}
.note-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0.28rem 0.4rem;
  color: var(--text);
  text-align: left;
}
.note-btn.on {
  border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.idx {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  width: 1.4rem;
}
</style>
