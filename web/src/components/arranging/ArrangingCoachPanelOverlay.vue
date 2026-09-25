<script setup lang="ts">
/**
 * Coach full-panel modes: settings, key ideas, or help (replaces workspace).
 */
import ArrangingCoachConfig from './ArrangingCoachConfig.vue'
import ArrangingCoachHelpPanel from './ArrangingCoachHelpPanel.vue'
import ArrangingTeachStrip from './ArrangingTeachStrip.vue'
import { DEFAULT_QA_CONFIG } from '../../domain/arranging/coachConfig'
import { DEFAULT_CONTEST_PROFILE } from '../../domain/arranging/contestProfile'
import type { ArrangementQaConfig, QaCheckGroupId } from '../../domain/arranging/coachConfig'
import type { ContestProfile, TuningMode } from '../../domain/arranging/types'

defineProps<{
  mode: 'config' | 'ideas' | 'help'
  contestProfile: ContestProfile
  tuningMode: TuningMode
  qaConfig: ArrangementQaConfig
  orgTip: string | null
  glossaryIds: readonly string[]
  helpTitle: string
  helpTip: string
  helpDetail: string
}>()

const emit = defineEmits<{
  close: []
  'update:contestProfile': [ContestProfile]
  'update:tuningMode': [TuningMode]
  'update:qaGroup': [groupId: QaCheckGroupId, enabled: boolean]
  'update:cadenceBias': []
}>()
</script>

<template>
  <ArrangingCoachConfig
    v-if="mode === 'config'"
    class="overlay"
    :contest-profile="contestProfile || DEFAULT_CONTEST_PROFILE"
    :tuning-mode="tuningMode || 'equal'"
    :qa-config="qaConfig || DEFAULT_QA_CONFIG"
    :org-tip="orgTip"
    @update:contest-profile="emit('update:contestProfile', $event)"
    @update:tuning-mode="emit('update:tuningMode', $event)"
    @update:qa-group="(id, on) => emit('update:qaGroup', id, on)"
    @update:cadence-bias="emit('update:cadenceBias')"
    @close="emit('close')"
  />
  <ArrangingTeachStrip
    v-else-if="mode === 'ideas'"
    panel
    class="overlay"
    heading="Key ideas for this step"
    :ids="glossaryIds"
    @close="emit('close')"
  />
  <ArrangingCoachHelpPanel
    v-else
    class="overlay"
    :title="helpTitle"
    :tip="helpTip"
    :detail="helpDetail"
    @close="emit('close')"
  />
</template>

<style scoped>
.overlay {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
</style>
