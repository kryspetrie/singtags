<script setup lang="ts">
/**
 * Arranging coach — Home → Chords → Check → Auto → Polish.
 */
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue'
import { visualPxToLayoutPx } from '../../lib/uiScale'
import ArrangingIssueBoard from './ArrangingIssueBoard.vue'
import ArrangingCoachSuggestPanel from './ArrangingCoachSuggestPanel.vue'
import ArrangingLearnDrawer from './ArrangingLearnDrawer.vue'
import ArrangingCandidateWhy from './ArrangingCandidateWhy.vue'
import ArrangingStepRail from './ArrangingStepRail.vue'
import ArrangingPathOptimize from './ArrangingPathOptimize.vue'
import ArrangingReviewPolish from './ArrangingReviewPolish.vue'
import ArrangingCoachChrome from './ArrangingCoachChrome.vue'
import ArrangingCoachPanelOverlay from './ArrangingCoachPanelOverlay.vue'
import ArrangingCoachIdeasPanel from './ArrangingCoachIdeasPanel.vue'
import ArrangingCoachHelpPanel from './ArrangingCoachHelpPanel.vue'
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
import {
  dualRomanTeach,
  formatRomanWithAlt,
  romanForChordDetailed,
} from '../../domain/arranging/secondaryDominant'
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
  stepNextReview,
  stepMoment,
  stepLint,
  stepNextGap,
  stepNextProblem,
  pillarsUnconfirmed,
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
  hearVoicingMidi,
  previewVoicingGhosts,
  clearVoicingGhosts,
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
  chordLabelMode,
  setChordLabelMode,
  candLabel,
  candAltLabel,
  candIdentity,
  layerHint,
  whyFor,
  goCloseForMelody,
  pushToRoll,
} = api

const guided = useCoachGuidedAndReview({
  mode,
  focusTab,
  phase,
  pushToRoll,
  momentsLen: computed(() => api.moments.value.length),
  selectionTickRange: computed(() => {
    const r = props.inspectRange
    if (!r || r.endTick <= r.startTick) return null
    return { startTick: r.startTick, endTick: r.endTick }
  }),
  currentMomentTick: computed(() => selectedMoment.value?.startTick ?? null),
})

const {
  guidedStep,
  guidedStepLabel,
  selectGuidedStep,
  stepMelodyNote,
  onLabelRoles,
  checklist,
  howFactors,
  orgTip,
  autoStatus,
  lastPathReport,
  canRunPathOptimize,
  hasOptimizeSelection,
  optimizeBusy,
  optimizeProgressFraction,
  optimizeProgressLabel,
  onPathOptimize,
  onPathOptimizeTransport,
  setContestProfile,
  setTuningMode,
  setQaGroup,
} = guided

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

const labelTeach = computed(() => {
  const c = filteredCandidates.value[suggestIndex.value]
  const p = arrStore.current
  if (!c || !p) return null
  const detailed = romanForChordDetailed({
    rootPc: c.rootPc,
    natureId: c.natureId,
    tonality: p.tonality,
    mode: p.tonalityMode ?? 'major',
    resolvesToRoot: c.nextPillarRoot ?? null,
  })
  const body = dualRomanTeach({
    roman: detailed.roman,
    altRoman: detailed.altRoman,
    natureId: c.natureId,
  })
  if (!body) return null
  return {
    label: formatRomanWithAlt(detailed.roman, detailed.altRoman),
    body,
    glossaryIds: ['dual_roman', 'secondary_dom'],
  }
})

const chooseMomentLine = computed(() => {
  const ctx = momentContext.value
  if (!ctx) return selectedMoment.value ? 'Moment' : ''
  const bits = [`Lead ${ctx.leadPitch}`]
  if (ctx.pillarLabel) bits.push(`Pillar ${ctx.pillarLabel}`)
  else if (softHomeLabel.value) bits.push(softHomeLabel.value)
  if (ctx.heldLead) bits.push('Post')
  if (ctx.kind === 'stack' && ctx.title) bits.push(ctx.title)
  return bits.join(' · ')
})

const chooseBanner = computed(() => {
  if (uncoveredSelected.value) {
    return 'No Sketch, Detected, or melody home under this moment — paint a Sketch chord.'
  }
  if (mode.value === 'review' && !pillars.value.length && !softHomeLabel.value) {
    return 'Review needs Sketch chords for ranked suggestions — lock phrase chords on the Sketch lane.'
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
  reviewCount: pillarsUnconfirmed,
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
  stepNextReview,
  onProposeNext,
  onLabelRoles,
  goChords: () => selectGuidedStep('chords'),
  applyBest: applySelectedSuggest,
  fixAllSafe,
  onPathOptimize: onPathOptimizeTransport,
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

const panelMode = ref<'config' | null>(null)
const dockWidthRem = ref(44)
const resizing = ref(false)

type LearnRequest =
  | { kind: 'ideas' }
  | { kind: 'help' }
  | { kind: 'why' }
  | { kind: 'lesson'; title: string; glossaryIds: readonly string[]; intro?: string }

const learnRequest = ref<LearnRequest | null>(null)
const learnReturn = ref<'ideas' | 'help' | 'why'>('ideas')

const learnOpen = computed(
  () =>
    learnRequest.value != null &&
    (learnRequest.value.kind !== 'why' ||
      (focusTab.value === 'choose' && chooseWhyView.value != null)),
)

const learnSections = computed(() => [
  { id: 'ideas', label: 'Ideas' },
  { id: 'help', label: 'Help' },
  { id: 'why', label: 'Why', disabled: chooseWhyView.value == null },
])

function closeLearn(): void {
  if (learnRequest.value?.kind === 'why') chooseWhyOpen.value = false
  learnRequest.value = null
}

function setLearnSection(id: string): void {
  if (id === 'why') {
    if (!chooseWhyView.value) return
    chooseWhyOpen.value = true
    return
  }
  if (id !== 'ideas' && id !== 'help') return
  if (chooseWhyOpen.value) chooseWhyOpen.value = false
  panelMode.value = null
  learnRequest.value = { kind: id }
}

function backFromLesson(): void {
  const back = learnReturn.value
  if (back === 'why' && chooseWhyView.value) {
    chooseWhyOpen.value = true
    return
  }
  if (chooseWhyOpen.value) chooseWhyOpen.value = false
  learnRequest.value = { kind: back === 'why' ? 'ideas' : back }
}

function openLesson(lesson: {
  title: string
  glossaryIds: readonly string[]
  intro?: string
}): void {
  const kind = learnRequest.value?.kind
  if (kind === 'ideas' || kind === 'help' || kind === 'why') learnReturn.value = kind
  if (chooseWhyOpen.value) chooseWhyOpen.value = false
  panelMode.value = null
  learnRequest.value = { kind: 'lesson', ...lesson }
}

function openLintLesson(): void {
  const detail = lintDetail.value
  if (!detail) return
  openLesson({
    title: detail.headline,
    glossaryIds: detail.glossary.map((g) => g.id),
    intro: detail.body,
  })
}

watch(chooseWhyOpen, (on) => {
  if (on) {
    panelMode.value = null
    learnRequest.value = { kind: 'why' }
  } else if (learnRequest.value?.kind === 'why') {
    learnRequest.value = null
  }
})

function onLearnLint(lint: Parameters<typeof learnLint>[0]): void {
  learnLint(lint)
  openLintLesson()
}

function toggleLearn(): void {
  if (learnOpen.value) {
    closeLearn()
    return
  }
  togglePanel('ideas')
}

function togglePanel(mode: 'config' | 'ideas' | 'help'): void {
  if (chooseWhyOpen.value) chooseWhyOpen.value = false
  if (mode === 'config') {
    const next = panelMode.value === 'config' ? null : 'config'
    panelMode.value = next
    if (next) learnRequest.value = null
    return
  }
  panelMode.value = null
  learnRequest.value = learnRequest.value?.kind === mode ? null : { kind: mode }
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
  // getBoundingClientRect is visual; /16 for rem must use layout width under CSS zoom.
  const renderedRem = dock
    ? visualPxToLayoutPx(dock.getBoundingClientRect().width) / 16
    : dockWidthRem.value
  const startW = Number.isFinite(renderedRem) ? renderedRem : dockWidthRem.value
  dockWidthRem.value = startW

  const onMove = (ev: PointerEvent) => {
    const dx = visualPxToLayoutPx(ev.clientX - startX)
    dockWidthRem.value = Math.min(56, Math.max(22, startW - dx / 16))
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
    <ArrangingLearnDrawer
      :open="learnOpen"
      title="Learn"
      :section="learnRequest?.kind"
      :sections="learnSections"
      @update:section="setLearnSection"
      @back="backFromLesson"
      @close="closeLearn"
    >
      <ArrangingCoachIdeasPanel
        v-if="learnRequest?.kind === 'ideas'"
        :title="ideasTitle"
        :intro="ideasHelp.ideasIntro"
        :ideas="ideasHelp.ideas"
        embedded
        @learn="openLesson"
        @close="closeLearn"
      />
      <ArrangingCoachHelpPanel
        v-else-if="learnRequest?.kind === 'help'"
        :title="helpTitle"
        :intro="ideasHelp.helpIntro"
        :sections="ideasHelp.help"
        embedded
        @close="closeLearn"
      />
      <ArrangingCandidateWhy
        v-else-if="learnRequest?.kind === 'why' && chooseWhyView"
        :why="chooseWhyView"
        :show-numbers="whyShowNumbers"
        @update:show-numbers="whyShowNumbers = $event"
      />
      <ArrangingCoachTeachLesson
        v-else-if="learnRequest?.kind === 'lesson'"
        :title="learnRequest.title"
        :glossary-ids="learnRequest.glossaryIds"
        :intro="learnRequest.intro"
        hide-back
      />
    </ArrangingLearnDrawer>
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
      :show-config="panelMode === 'config'"
      :show-learn="learnOpen"
      @toggle-config="togglePanel('config')"
      @toggle-learn="toggleLearn"
      @pop-out="emit('popOut')"
      @close="emit('close')"
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
              :label-teach="labelTeach"
              :cadence-plans="cadencePlans"
              :hearing-plan-id="hearingPlanId"
              :preview-plan-id="previewPlanId"
              :banner="chooseBanner"
              :candidates="filteredCandidates"
              :selected-index="suggestIndex"
              :has-stack="!!currentStack"
              :label="candLabel"
              :alt-label="candAltLabel"
              :identity="candIdentity"
              :meta="layerHint"
              :why-open="chooseWhyOpen"
              :alt-chips="altChips"
              :counterpart="counterpart"
              :filter-options="filterOptions"
              :cand-filter="candFilter"
              :label-mode="chordLabelMode"
              @update:selected-index="suggestIndex = $event"
              @update:cand-filter="candFilter = $event"
              @update:label-mode="setChordLabelMode"
              @update:why-open="chooseWhyOpen = $event"
              @open-lesson="openLesson"
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

            <p v-if="lintDetail && expandedLintId" class="lint-note">
              <span class="msg">{{ lintDetail.headline }}</span>
              <button type="button" class="learn-link" @click="openLintLesson">Learn</button>
              <button type="button" class="x" title="Close" @click="clearLintDetail">×</button>
            </p>

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
                @learn="onLearnLint"
              />
            </aside>
          </section>

          <!-- OPTIMIZE — Path Optimizer -->
          <section v-else-if="focusTab === 'auto'" class="panel">
            <ArrangingPathOptimize
              :status="autoStatus"
              :can-run="canRunPathOptimize"
              :last-report="lastPathReport"
              :has-selection="hasOptimizeSelection"
              :busy="optimizeBusy"
              :progress-fraction="optimizeProgressFraction"
              :progress-label="optimizeProgressLabel"
              @run="onPathOptimize"
              @hear-voicing="hearVoicingMidi"
              @preview-voicing="previewVoicingGhosts"
              @clear-voicing-preview="clearVoicingGhosts"
            />
          </section>

          <!-- POLISH — checklist / finish -->
          <section v-else class="panel">
            <ArrangingReviewPolish
              :checklist="checklist.items"
              :ready="checklist.ready"
              :how-factors="howFactors"
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
  position: relative;
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
.cand-actions button {
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
.lint-note {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
  margin: 0;
  font-size: 0.78rem;
}
.lint-note .msg {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 700;
}
.lint-note .learn-link,
.lint-note .x {
  border: 0;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}
.lint-note .x {
  color: var(--muted);
}
</style>
