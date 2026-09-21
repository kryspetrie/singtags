<script setup lang="ts">
/**
 * Review polish strip — strengthen, profile, tuning, export, checklist.
 */
import type { ContestProfile, TuningMode } from '../../domain/arranging/types'
import type { FinalChecklistItem } from '../../domain/arranging/finalChecklist'
import type { BarbershopnessFactor } from '../../domain/arranging/barbershopness'

defineProps<{
  contestProfile: ContestProfile
  tuningMode: TuningMode
  orgTip: string | null
  checklist: FinalChecklistItem[]
  ready: boolean
  howFactors: BarbershopnessFactor[]
  musicXmlAvailable: boolean
}>()

const emit = defineEmits<{
  strengthen: []
  polish: []
  'update:contestProfile': [ContestProfile]
  'update:tuningMode': [TuningMode]
  exportMidi: []
  exportMusicXml: []
  applySwipe: []
}>()

const profiles: { id: ContestProfile; label: string }[] = [
  { id: 'sai11', label: 'SAI-11' },
  { id: 'bhs_extended', label: 'BHS extended' },
  { id: 'learning', label: 'Learning' },
]
</script>

<template>
  <section class="polish" aria-label="Review polish">
    <h3 class="subh">Polish</h3>
    <div class="row">
      <button type="button" class="btn" @click="emit('strengthen')">Strengthen</button>
      <button type="button" class="btn" @click="emit('polish')">Polish voicing</button>
      <button type="button" class="btn" @click="emit('applySwipe')">Try swipe seed</button>
    </div>

    <label class="field">
      Contest profile
      <select
        :value="contestProfile"
        @change="emit('update:contestProfile', ($event.target as HTMLSelectElement).value as ContestProfile)"
      >
        <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.label }}</option>
      </select>
    </label>
    <p v-if="orgTip" class="tip">{{ orgTip }}</p>

    <label class="field">
      Tuning
      <select
        :value="tuningMode"
        @change="emit('update:tuningMode', ($event.target as HTMLSelectElement).value as TuningMode)"
      >
        <option value="equal">Equal temperament</option>
        <option value="just">just intonation</option>
      </select>
    </label>

    <div class="row">
      <button type="button" class="btn primary" @click="emit('exportMidi')">Export MIDI</button>
      <button
        v-if="musicXmlAvailable"
        type="button"
        class="btn"
        @click="emit('exportMusicXml')"
      >
        Export MusicXML
      </button>
    </div>

    <details class="check">
      <summary>
        Checklist
        <span class="meta">{{ ready ? 'ready' : 'residuals' }}</span>
      </summary>
      <ul>
        <li v-for="item in checklist" :key="item.id" :class="{ ok: item.ok }">
          <strong>{{ item.ok ? '✓' : '·' }}</strong>
          {{ item.label }}
          <span v-if="item.detail" class="meta"> — {{ item.detail }}</span>
        </li>
      </ul>
    </details>

    <details v-if="howFactors.length" class="check">
      <summary>How barbershop (factors)</summary>
      <ul>
        <li v-for="f in howFactors" :key="f.id">
          {{ f.label }}
          <span class="meta"> — {{ f.detail || `${Math.round(f.points)} pts` }}</span>
        </li>
      </ul>
    </details>
  </section>
</template>

<style scoped>
.polish {
  display: grid;
  gap: 0.4rem;
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
.btn.primary {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.field {
  display: grid;
  gap: 0.2rem;
  font-size: 0.75rem;
  font-weight: 650;
}
.field select {
  min-height: 1.9rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg, var(--surface));
  font: inherit;
}
.tip,
.meta {
  margin: 0;
  font-size: 0.72rem;
  color: var(--muted);
  font-weight: 500;
}
.check {
  font-size: 0.78rem;
}
.check ul {
  list-style: none;
  margin: 0.3rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.2rem;
}
.check li.ok {
  color: var(--accent);
}
</style>
