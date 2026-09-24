<script setup lang="ts">
/**
 * Coaching configuration — ruleset, temperament, cadence bias, and QA groups.
 */
import { ref, watch } from 'vue'
import {
  QA_CHECK_GROUPS,
  isQaGroupEnabled,
  type QaCheckGroupId,
} from '../../domain/arranging/coachConfig'
import type { ContestProfile, TuningMode } from '../../domain/arranging/types'
import type { ArrangementQaConfig } from '../../domain/arranging/coachConfig'
import {
  loadCadenceBias,
  saveCadenceBias,
  type CadenceBias,
} from '../../domain/arranging/cadences'

defineProps<{
  contestProfile: ContestProfile
  tuningMode: TuningMode
  qaConfig: ArrangementQaConfig
  orgTip: string | null
}>()

const emit = defineEmits<{
  'update:contestProfile': [ContestProfile]
  'update:tuningMode': [TuningMode]
  'update:qaGroup': [groupId: QaCheckGroupId, enabled: boolean]
  'update:cadenceBias': [CadenceBias]
  close: []
}>()

const profiles: { id: ContestProfile; label: string; hint: string }[] = [
  { id: 'bhs_extended', label: 'BHS extended', hint: 'SAI-11 plus half-dim & dim (default)' },
  { id: 'sai11', label: 'SAI-11 (Rylander)', hint: 'Sweet Adelines eleven-chord vocabulary' },
  { id: 'learning', label: 'Learning', hint: 'Full vocabulary; illegal chords warn only' },
]

const cadenceBias = ref<CadenceBias>(loadCadenceBias())

watch(cadenceBias, (v) => {
  saveCadenceBias(v)
  emit('update:cadenceBias', v)
})

function groupOn(config: ArrangementQaConfig, id: QaCheckGroupId): boolean {
  return isQaGroupEnabled(config, id)
}
</script>

<template>
  <section class="coach-config" aria-label="Coaching configuration">
    <header class="cfg-head">
      <h3 class="subh">Coaching configuration</h3>
      <button type="button" class="icon" aria-label="Close configuration" @click="emit('close')">
        ×
      </button>
    </header>

    <label class="field">
      Contest ruleset
      <select
        :value="contestProfile"
        @change="
          emit(
            'update:contestProfile',
            ($event.target as HTMLSelectElement).value as ContestProfile,
          )
        "
      >
        <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.label }}</option>
      </select>
    </label>
    <p class="hint">{{ profiles.find((p) => p.id === contestProfile)?.hint }}</p>
    <p v-if="orgTip" class="hint tip">{{ orgTip }}</p>

    <label class="field">
      Temperament
      <select
        :value="tuningMode"
        @change="
          emit('update:tuningMode', ($event.target as HTMLSelectElement).value as TuningMode)
        "
      >
        <option value="equal">Equal temperament</option>
        <option value="just">Just intonation (lock &amp; ring)</option>
      </select>
    </label>
    <p class="hint">Affects hear / export tuning; analysis still uses equal pitch classes.</p>

    <label class="field">
      Cadence bias
      <select v-model="cadenceBias" aria-label="Cadence bias">
        <option value="strong">Strong (default)</option>
        <option value="moderate">Moderate</option>
        <option value="off">Off</option>
      </select>
    </label>
    <p class="hint">
      How strongly Coach and Detected prefer textbook cadences (V7→I, II7→V7→I, I7→IV). Off is for
      experimental reharmonization.
    </p>

    <fieldset class="checks">
      <legend>Validations</legend>
      <p class="hint">
        Melody, pillars, and orphan stacks always run. Toggle the rest to match how strict you want
        Coach to be.
      </p>
      <label v-for="g in QA_CHECK_GROUPS" :key="g.id" class="check">
        <input
          type="checkbox"
          :checked="groupOn(qaConfig, g.id)"
          @change="
            emit('update:qaGroup', g.id, ($event.target as HTMLInputElement).checked)
          "
        />
        <span>
          <strong>{{ g.label }}</strong>
          <small>{{ g.hint }}</small>
        </span>
      </label>
    </fieldset>
  </section>
</template>

<style scoped>
.coach-config {
  display: grid;
  gap: 0.45rem;
  padding: 0.35rem 0 0.55rem;
  border-bottom: 1px solid var(--border);
}
.cfg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}
.subh {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 700;
}
.icon {
  border: none;
  background: transparent;
  font: inherit;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  color: var(--muted);
  min-width: 1.6rem;
  min-height: 1.6rem;
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
.hint {
  margin: 0;
  font-size: 0.72rem;
  color: var(--muted);
  font-weight: 500;
}
.hint.tip {
  font-style: italic;
}
.checks {
  margin: 0.15rem 0 0;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  display: grid;
  gap: 0.35rem;
}
.checks legend {
  padding: 0 0.25rem;
  font-size: 0.75rem;
  font-weight: 700;
}
.check {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.45rem;
  align-items: start;
  font-size: 0.78rem;
  cursor: pointer;
}
.check strong {
  display: block;
  font-weight: 650;
}
.check small {
  display: block;
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 500;
}
</style>
