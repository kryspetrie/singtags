<script setup lang="ts">
/**
 * Coach full-panel modes: Tweaks, ideas, or help (replaces workspace).
 */
import ArrangingCoachConfig from './ArrangingCoachConfig.vue'
import ArrangingCoachHelpPanel from './ArrangingCoachHelpPanel.vue'
import ArrangingCoachIdeasPanel from './ArrangingCoachIdeasPanel.vue'
import { DEFAULT_QA_CONFIG } from '../../domain/arranging/coachConfig'
import { DEFAULT_CONTEST_PROFILE } from '../../domain/arranging/contestProfile'
import type { ArrangementQaConfig, QaCheckGroupId } from '../../domain/arranging/coachConfig'
import type { ContestProfile, TuningMode } from '../../domain/arranging/types'
import type { CoachIdeaCard, CoachHelpSection } from '../../application/arranging/coachIdeasHelp'

defineProps<{
  mode: 'config' | 'ideas' | 'help'
  contestProfile: ContestProfile
  tuningMode: TuningMode
  qaConfig: ArrangementQaConfig
  orgTip: string | null
  ideasTitle: string
  ideasIntro: string
  ideas: readonly CoachIdeaCard[]
  helpTitle: string
  helpIntro: string
  helpSections: readonly CoachHelpSection[]
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
  <ArrangingCoachIdeasPanel
    v-else-if="mode === 'ideas'"
    class="overlay"
    :title="ideasTitle"
    :intro="ideasIntro"
    :ideas="ideas"
    @close="emit('close')"
  />
  <ArrangingCoachHelpPanel
    v-else
    class="overlay"
    :title="helpTitle"
    :intro="helpIntro"
    :sections="helpSections"
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
