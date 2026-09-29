<script setup lang="ts">
/**
 * Arranging coach — Home → Chords → Check → Polish.
 */
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue'
import ArrangingIssueBoard from './ArrangingIssueBoard.vue'
import ArrangingCoachSuggestPanel from './ArrangingCoachSuggestPanel.vue'
import ArrangingCoachWhyDock from './ArrangingCoachWhyDock.vue'
import ArrangingStepRail from './ArrangingStepRail.vue'
import ArrangingReviewPolish from './ArrangingReviewPolish.vue'
import ArrangingCoachChrome from './ArrangingCoachChrome.vue'
import ArrangingCoachPanelOverlay from './ArrangingCoachPanelOverlay.vue'
import ArrangingCoachLanding from './ArrangingCoachLanding.vue'
import ArrangingCoachTransport from './ArrangingCoachTransport.vue'
import ArrangingCoachTeachLesson from './ArrangingCoachTeachLesson.vue'
import ConfirmDialog from '../ConfirmDialog.vue'
import { labelForGuidedStep } from '../../application/arranging/GuidedSteps'
import { coachIdeasHelpForStep } from '../../application/arranging/coachIdeasHelp'
import { useCoachTransport } from '../../composables/useCoachTransport'
import { createCoachTransportActions } from '../../composables/useCoachTransportActions'
import {
  clearCoachRollTransportState,
  publishCoachRollTransport,
  registerCoachRollTransport,
} from '../../lib/arranging/coachRollTransport'
import { registerCoachPopoutIntentHandler } from '../../lib/arranging/coachPopout'
import type { CoachTransportView } from '../../composables/useCoachTransport'
import { DEFAULT_QA_CONFIG } from '../../domain/arranging/coachConfig'
import { DEFAULT_CONTEST_PROFILE } from '../../domain/arranging/contestProfile'
import type { ChordAnalysisSegment } from '../../domain/arranging/chordAnalysisBar'
import { useArrangingCoachDock, type CoachGhostNote } from './useArrangingCoachDock'
import { useCoachGuidedAndReview } from '../../composables/useCoachGuidedAndReview'

export type { CoachGhostNote }

const props = defineProps<{
  inspectRange?: { startTick: number; endTick: number } | null
  /** Detected lane — soft home-root ranking when Sketch pillars are not marked. */
  detectSegments?: readonly ChordAnalysisSegment[]
  /** Pop-out window: mirror transport model to the main roll strip. */
  isPopoutWindow?: boolean
  postTransportState?: (active: boolean, model: CoachTransportView | null) => void
}>()

const emit = defineEmits<{
  close: []
  previewGhost: [ghosts: CoachGhostNote[]]
  clearGhost: []
  'update:preview': [draft: import('../../lib/tagRoll/harmonyPreviewDraft').HarmonyPreviewDraft | null]
  releaseInspect: []
  focusTick: [tick: number]
  focusRange: [startTick: number, endTick: number, select?: 'pillar' | 'column' | 'range' | 'none']
  focusPart: [tick: number, partName: string]
  popOut: []
}>()

const inspectRangeRef = toRef(props, 'inspectRange')
const detectSegmentsRef = toRef(props, 'detectSegments')
const api = useArrangingCoachDock(emit, {
  inspectRange: inspectRangeRef,
  detectSegments: detectSegmentsRef,
})
const {
  arrStore,
  syncing,
  phase,
  mode,
  focusTab,
  whyIndex,
  whyShowNumbers,
  tip,
  melody,
  moments,
  pillars,
  selectedMoment,
  selectedPil,
  filteredCandidates,
  filterOptions,
  candFilter,
  altChips,
  counterpart,
  issueGroups,
  expandedLintId,
  lintDetail,
  clearLintDetail,
  lintParts,
  pillarProgressLabel,
  momentProgressLabel,
  repairTour,
  noteLints,
  emptyMomentCount,
  currentStack,
  uncoveredSelected,
  softHomeLabel,
  momentContext,
  suggestIndex,
  ensureLinked,
  stepPillar,
  stepMoment,
  stepLint,
  stepNextGap,
  stepNextProblem,
  onProposeNext,
  onSkipProposed,
  onLockPillar,
  previewCand,
  hearCand,
  holdStartHear,
  holdStopHear,
  hearCurrentStack,
  hearPillarRoot,
  hearSelectedSuggest,
  applyCand,
  applySelectedSuggest,
  applyAltChip,
  previewAltChip,
  holdStartAltChip,
  previewCounterpartCand,
  holdStartCounterpartCand,
  applyCounterpartNow,
  fillEmptyWithBest,
  fixAllSafe,
  fixItem,
  cadencePlans,
  applyCadencePlan,
  applyCadencePlanStep,
  hearCadencePlan,
  previewCadencePlan,
  hearingPlanId,
  previewPlanId,
  pendingKeySuggestionMessage,
  cancelPendingKeySuggestion,
  confirmPendingKeySuggestion,
  canFix,
  learnLint,
  jumpToLint,
  candIdentity,
  layerHint,
  whyFor,
  goCloseForMelody,
  pushToRoll,
} = api

const {
  guidedStep,
  guidedStepLabel,
  selectGuidedStep,
  stepMelodyNote,
  onLabelRoles,
  checklist,
  howFactors,
  orgTip,
  musicXmlAvailable,
  onStrengthen,
  onPolish,
  onApplySwipe,
  setContestProfile,
  setTuningMode,
  setQaGroup,
  exportMidi,
  exportMusicXml,
} = useCoachGuidedAndReview({
  mode,
  focusTab,
  phase,
  pushToRoll,
  momentsLen: computed(() => api.moments.value.length),
})

const ideasHelp = computed(() => coachIdeasHelpForStep(guidedStep.value))

const cadenceTeach = computed(() => {
  const t = tip.value
  if (!t?.lessonId || t.lessonId !== 'L-classic-cadences') return null
  const label = t.title.replace(/^Cadence:\s*/i, '').trim()
  if (!label || !t.body) return null
  const glossaryIds =
    t.glossaryIds?.length ?
      [...t.glossaryIds]
    : ['classic_cadences', 'circle_fifths', 'tension_release']
  if (!glossaryIds.includes('classic_cadences')) glossaryIds.unshift('classic_cadences')
  return { label, body: t.body, glossaryIds }
})

const chooseMomentLine = computed(() => {
  const ctx = momentContext.value
  if (!ctx) return selectedMoment.value ? 'Moment' : ''
  const bits = [`Lead ${ctx.leadPitch}`]
  if (ctx.roleLabel) bits.push(ctx.roleLabel)
  if (ctx.pillarLabel) bits.push(`Pillar ${ctx.pillarLabel}`)
  else if (softHomeLabel.value) bits.push(softHomeLabel.value)
  if (ctx.heldLead) bits.push('Post')
  if (ctx.kind === 'stack' && ctx.title) bits.push(ctx.title)
  return bits.join(' · ')
})

const chooseBanner = computed(() => {
  if (uncoveredSelected.value) {
    return 'No Sketch, Detected, or melody home under this moment — paint a chord or ◆ a pillar.'
  }
  if (mode.value === 'review' && !pillars.value.length && !softHomeLabel.value) {
    return 'Review needs Sketch pillars for ranked suggestions — lock phrase chords, then ◆ home roots.'
  }
  return null
})

const chooseWhyOpen = computed({
  get: () => whyIndex.value != null,
  set: (on: boolean) => {
    whyIndex.value = on ? suggestIndex.value : null
  },
})

const chooseWhyView = computed(() => {
  if (whyIndex.value == null) return null
  const i = suggestIndex.value
  if (!filteredCandidates.value[i]) return null
  return whyFor(i)
})

watch(suggestIndex, (i) => {
  if (whyIndex.value != null) whyIndex.value = i
})

watch(focusTab, (tab) => {
  if (tab !== 'choose' && whyIndex.value != null) whyIndex.value = null
})

const rolesStatus = computed(() => '')
const checkStatus = computed(() => `${noteLints.value.length} issue(s) in range`)

const transport = useCoachTransport({
  guidedStep,
  guidedStepLabel,
  pillarStatus: pillarProgressLabel,
  momentStatus: momentProgressLabel,
  rolesStatus,
  checkStatus,
  repairTour,
  pillarsLen: computed(() => pillars.value.length),
  melodyLen: computed(() => melody.value.length),
  momentsLen: computed(() => moments.value.length),
  lintCount: computed(() => noteLints.value.length),
  emptyMomentCount,
  selectedPil,
  canApplyChord: computed(() => filteredCandidates.value.length > 0),
  hasStackMidi: computed(() => !!currentStack.value?.midi),
})

const transportActions = createCoachTransportActions({
  guidedStep,
  focusTab,
  currentStack,
  filteredCandidates,
  stepPillar,
  stepMelodyNote,
  stepMoment,
  stepLint,
  stepNextGap,
  stepNextProblem,
  onProposeNext,
  onLabelRoles,
  goChords: () => selectGuidedStep('chords'),
  applyBest: applySelectedSuggest,
  fixAllSafe,
  onStrengthen,
  hearPillarRoot,
  hearCurrentStack,
  hearCand,
  hearSelectedSuggest,
})

const onTransportPrev = transportActions.prev
const onTransportNext = transportActions.next
const onTransportPrimary = transportActions.primary
const onTransportHear = transportActions.hear
const onTransportSecondary = transportActions.secondary

let unregisterRollTransport: (() => void) | null = null
let unregisterPopoutIntent: (() => void) | null = null

function runTransportIntent(
  action: 'prev' | 'next' | 'primary' | 'hear' | 'lock' | 'skip' | 'secondary',
): void {
  switch (action) {
    case 'prev':
      onTransportPrev()
      break
    case 'next':
      onTransportNext()
      break
    case 'primary':
      onTransportPrimary()
      break
    case 'hear':
      onTransportHear()
      break
    case 'lock':
      onLockPillar()
      break
    case 'skip':
      onSkipProposed()
      break
    case 'secondary':
      onTransportSecondary()
      break
  }
}

watch(
  [guidedStep, transport, () => melody.value.length],
  () => {
    const active = melody.value.length > 0
    const model = transport.value
    publishCoachRollTransport({ active, model })
    props.postTransportState?.(active, model)
  },
  { immediate: true },
)

const panelMode = ref<'config' | 'ideas' | 'help' | null>(null)
const dockWidthRem = ref(44)
const resizing = ref(false)

function togglePanel(mode: 'config' | 'ideas' | 'help'): void {
  panelMode.value = panelMode.value === mode ? null : mode
}

const ideasTitle = computed(() => `Ideas - ${labelForGuidedStep(guidedStep.value)}`)
const helpTitle = computed(() => `Help - ${labelForGuidedStep(guidedStep.value)}`)

function onResizePointerDown(e: PointerEvent): void {
  if (e.button !== 0) return
  e.preventDefault()
  const handle = e.currentTarget as HTMLElement
  handle.setPointerCapture(e.pointerId)
  resizing.value = true
  const dock = handle.parentElement
  const startX = e.clientX
  // Prefer rendered width so rem state matches what the user sees (vw caps, etc.).
  const renderedRem = dock ? dock.getBoundingClientRect().width / 16 : dockWidthRem.value
  const startW = Number.isFinite(renderedRem) ? renderedRem : dockWidthRem.value
  dockWidthRem.value = startW

  const onMove = (ev: PointerEvent) => {
    const dx = startX - ev.clientX
    dockWidthRem.value = Math.min(56, Math.max(22, startW + dx / 16))
  }
  const onUp = (ev: PointerEvent) => {
    resizing.value = false
    try {
      handle.releasePointerCapture(ev.pointerId)
    } catch {
      /* already released */
    }
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
}

onMounted(() => {
  void ensureLinked()
  unregisterRollTransport = registerCoachRollTransport({
    prev: onTransportPrev,
    next: onTransportNext,
    primary: onTransportPrimary,
    hear: onTransportHear,
    lock: onLockPillar,
    skip: onSkipProposed,
    secondary: onTransportSecondary,
  })
  if (props.isPopoutWindow) {
    unregisterPopoutIntent = registerCoachPopoutIntentHandler(runTransportIntent)
  }
})
onUnmounted(() => {
  unregisterRollTransport?.()
  unregisterPopoutIntent?.()
  clearCoachRollTransportState()
  props.postTransportState?.(false, null)
  emit('clearGhost')
})
</script>

<template>
  <div class="coach-shell" :style="{ '--coach-dock-w': `${dockWidthRem}rem` }">
    <ArrangingCoachWhyDock
      v-if="chooseWhyOpen && chooseWhyView && focusTab === 'choose'"
      :why="chooseWhyView"
      :show-numbers="whyShowNumbers"
      :chord-label="
        filteredCandidates[suggestIndex]
          ? candIdentity(filteredCandidates[suggestIndex]!)
          : null
      "
      @close="chooseWhyOpen = false"
      @update:show-numbers="whyShowNumbers = $event"
    />
    <aside
      class="coach-dock"
      :class="{ resizing }"
      :style="{ width: `${dockWidthRem}rem`, maxWidth: 'min(56rem, 92vw)' }"
      aria-label="Arranging coach"
    >
    <div
      class="resize-handle"
      title="Drag to resize"
      role="separator"
      aria-orientation="vertical"
      @pointerdown="onResizePointerDown"
    />

    <ArrangingCoachChrome
      :show-config="panelMode === 'config'" :show-ideas="panelMode === 'ideas'"
      :show-help="panelMode === 'help'"
      @toggle-config="togglePanel('config')" @toggle-ideas="togglePanel('ideas')"
      @toggle-help="togglePanel('help')" @pop-out="emit('popOut')" @close="emit('close')"
    />

    <p v-if="syncing" class="muted">Linking…</p>

    <div v-if="!melody.length" class="empty">
      <p>Enter the Lead melody on the roll first, then open Coach again.</p>
      <button type="button" class="primary" @click="goCloseForMelody">Close coach</button>
    </div>

    <template v-else>
      <!-- Roll overlay owns transport when docked; keep strip only in the pop-out window. -->
      <ArrangingCoachTransport
        v-if="isPopoutWindow"
        :model="transport"
        @prev="onTransportPrev"
        @next="onTransportNext"
        @primary="onTransportPrimary"
        @hear="onTransportHear"
        @lock="onLockPillar"
        @skip="onSkipProposed"
        @secondary="onTransportSecondary"
      />

      <div class="coach-body">
        <div class="coach-main">
          <ArrangingCoachPanelOverlay
            v-if="panelMode"
            :mode="panelMode"
            :contest-profile="arrStore.current?.contestProfile ?? DEFAULT_CONTEST_PROFILE"
            :tuning-mode="arrStore.current?.tuningMode ?? 'equal'"
            :qa-config="arrStore.current?.qaConfig ?? DEFAULT_QA_CONFIG"
            :org-tip="orgTip"
            :ideas-title="ideasTitle"
            :ideas-intro="ideasHelp.ideasIntro"
            :ideas="ideasHelp.ideas"
            :help-title="helpTitle"
            :help-intro="ideasHelp.helpIntro"
            :help-sections="ideasHelp.help"
            @close="panelMode = null"
            @update:contest-profile="setContestProfile" @update:tuning-mode="setTuningMode"
            @update:qa-group="setQaGroup" @update:cadence-bias="arrStore.refreshCandidates()"
          />
          <div v-else class="workspace"><div class="panel-scroll">
          <!-- HOME — workflow landing -->
          <ArrangingCoachLanding
            v-if="guidedStep === 'home' || focusTab === 'home'"
            @continue="selectGuidedStep('chords')"
          />

          <!-- CHOOSE — Harmonize-style flat suggest list + sticky Hear/Apply -->
          <section v-else-if="focusTab === 'choose'" class="panel">
            <ArrangingCoachSuggestPanel
              v-if="selectedMoment"
              :moment-line="chooseMomentLine"
              :cadence-teach="cadenceTeach"
              :cadence-plans="cadencePlans"
              :hearing-plan-id="hearingPlanId"
              :preview-plan-id="previewPlanId"
              :banner="chooseBanner"
              :candidates="filteredCandidates"
              :selected-index="suggestIndex"
              :has-stack="!!currentStack"
              :identity="candIdentity"
              :meta="layerHint"
              :why-open="chooseWhyOpen"
              :alt-chips="altChips"
              :counterpart="counterpart"
              :filter-options="filterOptions"
              :cand-filter="candFilter"
              @update:selected-index="suggestIndex = $event"
              @update:cand-filter="candFilter = $event"
              @update:why-open="chooseWhyOpen = $event"
              @preview="previewCand"
              @clear-preview="holdStopHear"
              @hold-start="holdStartHear"
              @hold-stop="holdStopHear"
              @apply="applyCand"
              @preview-alt="previewAltChip"
              @hold-start-alt="holdStartAltChip"
              @apply-alt="applyAltChip"
              @preview-counterpart="previewCounterpartCand"
              @hold-start-counterpart="holdStartCounterpartCand"
              @apply-counterpart="applyCounterpartNow"
              @fill-empties="fillEmptyWithBest"
              @apply-cadence-plan="applyCadencePlan"
              @apply-cadence-step="applyCadencePlanStep"
              @hear-cadence-plan="hearCadencePlan"
              @preview-cadence-plan="previewCadencePlan"
            />
            <p v-else class="muted">Select a moment with ← / → or click the roll.</p>

            <details
              v-if="lintDetail && expandedLintId"
              class="lint-detail"
              open
            >
              <summary>
                <span class="loc">{{
                  noteLints.find((l) => l.id === expandedLintId)
                    ? lintParts(noteLints.find((l) => l.id === expandedLintId)!).loc
                    : 'Issue'
                }}</span>
                <span class="msg">{{ lintDetail.headline }}</span>
                <button type="button" class="x" title="Close" @click.prevent="clearLintDetail">
                  x
                </button>
              </summary>
              <ArrangingCoachTeachLesson
                v-if="lintDetail.glossary.length"
                :title="lintDetail.headline"
                :glossary-ids="lintDetail.glossary.map((g) => g.id)"
                :intro="lintDetail.body"
                hide-back
              />
              <p v-else class="body">{{ lintDetail.body }}</p>
            </details>

            <aside v-if="noteLints.length" class="potential-issues">
              <h3 class="potential-title">
                Potential issues
                <span class="potential-count">{{ noteLints.length }}</span>
              </h3>
              <ul class="lint-mini">
                <li
                  v-for="lint in noteLints"
                  :key="lint.id"
                  :class="[lint.severity, { on: lint.id === expandedLintId }]"
                >
                  <button type="button" class="lint-jump" @click="jumpToLint(lint)">
                    <span class="loc">{{ lintParts(lint).loc }}</span>
                    <span class="msg">{{ lintParts(lint).message }}</span>
                  </button>
                  <button
                    v-if="canFix(lint)"
                    type="button"
                    class="fix-btn"
                    @click="fixItem(lint)"
                  >
                    Fix
                  </button>
                </li>
              </ul>
            </aside>
          </section>

          <!-- CHECK -->
          <section v-else-if="focusTab === 'check'" class="panel">
            <p class="hint">
              Click an issue to jump to that measure on Chords and open a teaching note with live
              suggestions. Fix when you understand the rule.
            </p>
            <div class="row">
              <button
                type="button"
                class="primary"
                title="Apply only auto-safe repairs; open Learn on anything that needs your ear"
                @click="fixAllSafe"
              >
                Fix all safe
              </button>
            </div>
            <aside class="potential-issues">
              <h3 class="potential-title">
                Potential issues
                <span v-if="noteLints.length" class="potential-count">{{ noteLints.length }}</span>
              </h3>
              <ArrangingIssueBoard
                :groups="issueGroups"
                :can-fix="canFix"
                :row-parts="lintParts"
                :expanded-id="expandedLintId"
                @jump="jumpToLint"
                @fix="fixItem"
                @learn="learnLint"
              />
            </aside>
          </section>

          <!-- POLISH -->
          <section v-else class="panel">
            <ArrangingReviewPolish
              :checklist="checklist.items"
              :ready="checklist.ready"
              :how-factors="howFactors"
              :music-xml-available="musicXmlAvailable"
              @strengthen="onStrengthen"
              @polish="onPolish"
              @apply-swipe="onApplySwipe"
              @export-midi="exportMidi"
              @export-music-xml="exportMusicXml"
            />
          </section>
            </div>
          </div>
        </div>
        <ArrangingStepRail :active="guidedStep" @select="selectGuidedStep" />
      </div>
    </template>

    <ConfirmDialog
      :open="!!pendingKeySuggestionMessage"
      title="Transpose chart?"
      :message="pendingKeySuggestionMessage"
      confirm-label="Transpose"
      @close="cancelPendingKeySuggestion"
      @confirm="confirmPendingKeySuggestion"
    />
    </aside>
  </div>
</template>

<style scoped>
.coach-shell {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  height: 100%;
  flex: 0 0 auto;
  min-width: 0;
  max-width: 100%;
}
.coach-dock {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: min(22rem, 100%);
  max-width: min(56rem, 92vw);
  height: 100%;
  padding: 0.55rem 0.7rem 0.75rem;
  border-left: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 94%, var(--bg));
  overflow: hidden;
  flex: 0 0 auto;
}
.resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 2;
}
.resize-handle:hover,
.coach-dock.resizing .resize-handle {
  background: color-mix(in srgb, var(--accent) 35%, transparent);
}
.muted,
.hint,
.meta,
.tiny {
  margin: 0;
  font-size: 0.78rem;
  color: var(--muted);
  line-height: 1.35;
}
.tiny {
  font-size: 0.72rem;
}
.empty {
  display: grid;
  gap: 0.5rem;
}
.session-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: 0 0 auto;
  min-height: 2rem;
}
.session-meta {
  flex: 1 1 auto;
  min-width: 0;
  display: grid;
  gap: 0.05rem;
  font-size: 0.72rem;
  color: var(--muted);
}
.session-meta strong {
  font-size: 0.84rem;
  color: var(--text);
}
.coach-body {
  display: flex; flex: 1 1 auto; min-height: 0; min-width: 0; gap: 0.4rem;
}
.coach-main {
  display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; min-height: 0; gap: 0.35rem;
}
.workspace {
  display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0;
}
.panel-scroll {
  flex: 1 1 auto; min-width: 0; min-height: 0; overflow: auto; padding-right: 0.15rem;
}
.panel {
  display: grid;
  gap: 0.45rem;
  align-content: start;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.primary,
.step-btn,
.fix-btn,
.cand-actions button,
.linkish {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
  min-height: 1.9rem;
  padding: 0.2rem 0.5rem;
}
.primary {
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
}
.primary.slim {
  min-height: 1.7rem;
  font-size: 0.75rem;
  white-space: nowrap;
}
.primary:disabled,
.step-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.card,
.banner {
  padding: 0.4rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  display: grid;
  gap: 0.3rem;
}
.root-big {
  display: grid;
  gap: 0.2rem;
  font-size: 0.75rem;
  font-weight: 650;
}
.root-sel {
  font: inherit;
  min-height: 2rem;
}
.stack-state {
  font-size: 0.72rem;
  font-weight: 700;
}
.stack-state.ok {
  color: #2d7a3e;
}
.stack-state.missing {
  color: #c47a12;
}
.note-line {
  display: flex;
  gap: 0.4rem;
  align-items: baseline;
}
.post-badge {
  font-size: 0.7rem;
  color: var(--muted);
}
.subh {
  margin: 0;
  font-size: 0.8rem;
}
.gaps ul,
.cands,
.lint-mini {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.3rem;
}
.potential-issues {
  display: grid;
  gap: 0.35rem;
  margin-top: 0.35rem;
  padding-top: 0.45rem;
  border-top: 1px solid var(--border);
}
.potential-title {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
}
.potential-count {
  margin-left: 0.25rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--muted);
}
.pillar-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.2rem;
  max-height: 9rem;
  overflow: auto;
}
.pillar-btn {
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
.pillar-btn.on {
  border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.pillar-btn .idx {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  width: 1.2rem;
}
.pillar-btn .pill-state {
  margin-left: auto;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--muted);
}
.pillar-btn.locked .pill-state {
  color: #2d7a3e;
}
.gap-jump {
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
  color: var(--text);
  padding: 0;
  text-align: left;
}
.gap-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.gap-add {
  font-size: 0.72rem;
  padding: 0.15rem 0.45rem;
}
.gap-jump:hover {
  text-decoration: underline;
}
.lint-mini li {
  display: flex;
  gap: 0.3rem;
  align-items: flex-start;
  padding: 0.25rem 0.3rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.75rem;
}
.lint-mini li.error {
  border-color: color-mix(in srgb, #c0392b 45%, var(--border));
}
.lint-mini li.on {
  border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.lint-jump {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: 3.2rem 1fr;
  gap: 0.4rem;
  align-items: baseline;
  border: 0;
  background: transparent;
  text-align: left;
  font: inherit;
  cursor: pointer;
  color: var(--text);
  padding: 0;
}
.lint-jump .loc {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--muted);
}
.lint-jump .msg {
  line-height: 1.35;
}
.lint-jump:hover .msg {
  text-decoration: underline;
}
.best-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.45rem;
}
.best-id,
.cand-id {
  font-size: 0.88rem;
}
.step-btn.slim {
  min-height: 1.65rem;
  font-size: 0.72rem;
  padding: 0.15rem 0.4rem;
}
.lint-detail {
  border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
  border-radius: 9px;
  padding: 0.4rem 0.5rem;
  background: color-mix(in srgb, var(--accent) 6%, transparent);
  display: grid;
  gap: 0.35rem;
}
.lint-detail summary {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem;
  cursor: pointer;
  font-weight: 700;
  list-style: none;
}
.lint-detail summary::-webkit-details-marker {
  display: none;
}
.advanced {
  margin-top: 0.25rem;
}
.advanced summary {
  cursor: pointer;
  user-select: none;
}
.lint-detail .loc {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  font-size: 0.78rem;
}
.lint-detail .msg {
  flex: 1;
  min-width: 0;
}
.lint-detail .x {
  border: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
  color: var(--muted);
  padding: 0 0.2rem;
}
.lint-detail .body {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--text);
}
.lint-detail .gloss {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.25rem;
  font-size: 0.72rem;
  color: var(--muted);
}
.other-cands {
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 0.35rem 0.45rem;
  display: grid;
  gap: 0.35rem;
}
.other-cands summary {
  cursor: pointer;
  font-weight: 700;
  font-size: 0.8rem;
}
.other-cands .meta {
  margin-left: 0.25rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--muted);
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 650;
  cursor: pointer;
  min-height: 1.65rem;
  padding: 0.1rem 0.5rem;
}
.filter-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.25rem;
}
.filter-row button {
  min-height: 1.6rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg, var(--surface));
  font: inherit;
  font-size: 0.72rem;
  font-weight: 650;
  cursor: pointer;
}
.filter-row button.on {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.cands.flat li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem 0.4rem;
  padding: 0.25rem 0;
  border: 0;
  border-radius: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
}
.inv-details {
  flex: 1 1 100%;
  margin: 0.15rem 0 0;
}
.inv-details summary {
  cursor: pointer;
  font-size: 0.78rem;
  color: var(--muted);
}
.inv-list {
  list-style: none;
  margin: 0.25rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.25rem;
}
.inv-list li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  align-items: center;
  border-bottom: 0 !important;
  padding: 0.15rem 0 !important;
}
.best-inv {
  margin: 0.35rem 0 0.15rem;
}
.cands.flat li:last-child {
  border-bottom: 0;
}
.cands.flat .why-inline {
  flex: 1 1 100%;
}
.cands li {
  display: grid;
  gap: 0.25rem;
  padding: 0.3rem;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.score-bar {
  display: inline-block;
  height: 4px;
  min-width: 1.5rem;
  max-width: 3.5rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 55%, transparent);
  vertical-align: middle;
}
.cand-meta {
  font-size: 0.72rem;
  color: var(--muted);
}
.linkish {
  background: transparent;
  border-color: transparent;
  text-decoration: underline;
  min-height: auto;
  padding: 0.1rem 0.2rem;
  font-size: 0.75rem;
}
</style>
