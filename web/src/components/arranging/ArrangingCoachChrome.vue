<script setup lang="ts">
/**
 * Coach dock header + optional coaching configuration panel.
 */
import ArrangingCoachConfig from './ArrangingCoachConfig.vue'
import { DEFAULT_QA_CONFIG } from '../../domain/arranging/coachConfig'
import type { ArrangementQaConfig, QaCheckGroupId } from '../../domain/arranging/coachConfig'
import type { ContestProfile, TuningMode } from '../../domain/arranging/types'

defineProps<{
  showConfig: boolean
  qaErrors: number
  qaWarns: number
  showConfigPanel: boolean
  contestProfile: ContestProfile
  tuningMode: TuningMode
  qaConfig: ArrangementQaConfig
  orgTip: string | null
}>()

const emit = defineEmits<{
  toggleConfig: []
  popOut: []
  close: []
  'update:contestProfile': [ContestProfile]
  'update:tuningMode': [TuningMode]
  'update:qaGroup': [groupId: QaCheckGroupId, enabled: boolean]
  'update:cadenceBias': []
  closeConfig: []
}>()
</script>

<template>
  <header class="dock-head">
    <h2 class="dock-title">Coach</h2>
    <div class="head-actions">
      <span v-if="qaErrors || qaWarns" class="qa-badge">{{ qaErrors }}e / {{ qaWarns }}w</span>
      <button
        type="button"
        class="icon-btn"
        title="Coaching configuration"
        aria-label="Coaching configuration"
        :aria-pressed="showConfig"
        @click="emit('toggleConfig')"
      >
        ⚙
      </button>
      <button type="button" class="icon-btn" title="Pop out" @click="emit('popOut')">↗</button>
      <button type="button" class="icon-btn" aria-label="Close coach" @click="emit('close')">
        ×
      </button>
    </div>
  </header>

  <ArrangingCoachConfig
    v-if="showConfigPanel"
    :contest-profile="contestProfile"
    :tuning-mode="tuningMode"
    :qa-config="qaConfig ?? DEFAULT_QA_CONFIG"
    :org-tip="orgTip"
    @update:contest-profile="emit('update:contestProfile', $event)"
    @update:tuning-mode="emit('update:tuningMode', $event)"
    @update:qa-group="(id, on) => emit('update:qaGroup', id, on)"
    @update:cadence-bias="emit('update:cadenceBias')"
    @close="emit('closeConfig')"
  />
</template>

<style scoped>
.dock-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}
.dock-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 750;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.qa-badge {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--muted);
  padding: 0.1rem 0.35rem;
  border-radius: 999px;
  border: 1px solid var(--border);
}
.icon-btn {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  font: inherit;
  cursor: pointer;
  min-width: 1.7rem;
  min-height: 1.7rem;
  line-height: 1;
}
</style>
