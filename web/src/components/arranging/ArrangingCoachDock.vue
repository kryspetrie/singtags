<script setup lang="ts">
/**
 * Guided arranging coach — mode landing + side-tab workspace.
 */
import { computed, onMounted, onUnmounted, ref, toRef } from 'vue'
import ArrangingContextCard from './ArrangingContextCard.vue'
import ArrangingCandidateWhy from './ArrangingCandidateWhy.vue'
import ArrangingCoachAlts from './ArrangingCoachAlts.vue'
import ArrangingCoachLanding from './ArrangingCoachLanding.vue'
import ArrangingIssueBoard from './ArrangingIssueBoard.vue'
import ArrangingStepRail from './ArrangingStepRail.vue'
import ArrangingReviewPolish from './ArrangingReviewPolish.vue'
import { coachModeCard } from '../../domain/arranging/coachModeCatalog'
import { useArrangingCoachDock, type CoachGhostNote } from './useArrangingCoachDock'
import { useCoachGuidedAndReview } from '../../composables/useCoachGuidedAndReview'

export type { CoachGhostNote }

const props = defineProps<{
  inspectRange?: { startTick: number; endTick: number } | null
}>()

const emit = defineEmits<{
  close: []
  previewGhost: [ghosts: CoachGhostNote[]]
  clearGhost: []
  focusTick: [tick: number]
  focusRange: [startTick: number, endTick: number]
  focusPart: [tick: number, partName: string]
  popOut: []
}>()

const inspectRangeRef = toRef(props, 'inspectRange')
const api = useArrangingCoachDock(emit, { inspectRange: inspectRangeRef })
const {
  arrStore,
  syncing,
  showLanding,
  phase,
  mode,
  focusTab,
  whyIndex,
  whyShowNumbers,
  nextAction,
  preferFlats,
  melody,
  moments,
  pillars,
  selectedMoment,
  selectedPil,
  candidates,
  filteredCandidates,
  maxScore,
  filterOptions,
  candFilter,
  altsOpen,
  altChips,
  counterpart,
  issueGroups,
  learnHint,
  lintRowLabel,
  progressLabel,
  coverageGaps,
  noteLints,
  pillarsUnconfirmed,
  canWalkArrange,
  canLockRemaining,
  currentStack,
  uncoveredSelected,
  momentContext,
  ensureLinked,
  enterMode,
  backToModes,
  stepMoment,
  stepNextGap,
  stepNextIssue,
  stepPillar,
  onInfer,
  onAddPillarAtPlayhead,
  onLockPillar,
  onLockRemaining,
  onDeletePillar,
  updatePillarRoot,
  enterWalk,
  addPillarHere,
  extendPreviousToHere,
  previewCand,
  hearCand,
  hearCurrentStack,
  hearPillarRoot,
  applyCand,
  applyBest,
  applyAltChip,
  applyCounterpartNow,
  compareHearTop2,
  fillEmptyWithBest,
  fixAllSafe,
  fixItem,
  canFix,
  learnLint,
  jumpToLint,
  candIdentity,
  layerHint,
  whyFor,
  runNextAction,
  goCloseForMelody,
  pcName,
  midiToNote,
  pushToRoll,
} = api

const {
  showStepRail,
  guidedStep,
  guidedTip,
  selectGuidedStep,
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
  exportMidi,
  exportMusicXml,
} = useCoachGuidedAndReview({
  mode,
  focusTab,
  phase,
  pushToRoll,
})

const modeCard = computed(() => coachModeCard(mode.value))
const dockWidthRem = ref(44)
const resizing = ref(false)

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

function openTab(tab: 'now' | 'choose' | 'check' | 'polish'): void {
  if (tab === 'choose') {
    if (!canWalkArrange.value) return
    enterWalk()
    return
  }
  focusTab.value = tab
  if (tab === 'check' || tab === 'polish') phase.value = 'walk'
}

onMounted(() => {
  void ensureLinked()
})
onUnmounted(() => {
  emit('clearGhost')
})
</script>

<template>
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

    <header class="dock-head">
      <h2 class="dock-title">Coach</h2>
      <div class="head-actions">
        <span v-if="arrStore.qaBadge.errors || arrStore.qaBadge.warns" class="qa-badge">
          {{ arrStore.qaBadge.errors }}e / {{ arrStore.qaBadge.warns }}w
        </span>
        <button type="button" class="icon-btn" title="Pop out" @click="emit('popOut')">↗</button>
        <button type="button" class="icon-btn" aria-label="Close coach" @click="emit('close')">
          ×
        </button>
      </div>
    </header>

    <p v-if="syncing" class="muted">Linking…</p>

    <div v-if="!melody.length" class="empty">
      <p>Enter the Lead melody on the roll first, then open Coach again.</p>
      <button type="button" class="primary" @click="goCloseForMelody">Close coach</button>
    </div>

    <ArrangingCoachLanding
      v-else-if="showLanding"
      :progress-label="progressLabel"
      @pick="enterMode"
    />

    <template v-else>
      <div class="session-bar">
        <button type="button" class="back" @click="backToModes">← Modes</button>
        <div class="session-meta">
          <strong>{{ modeCard.title }}</strong>
          <span>{{ progressLabel }}</span>
        </div>
        <button type="button" class="primary slim" @click="runNextAction">
          {{ nextAction.cta }}
        </button>
      </div>

      <ArrangingStepRail
        v-if="showStepRail"
        :active="guidedStep"
        :tip="guidedTip"
        @select="selectGuidedStep"
      />

      <div class="workspace">
        <nav class="side-tabs" aria-label="Coach panels">
          <button type="button" :class="{ on: focusTab === 'now' }" @click="openTab('now')">
            Now
            <span v-if="pillarsUnconfirmed" class="dot" />
          </button>
          <button
            type="button"
            :class="{ on: focusTab === 'choose' }"
            :disabled="!canWalkArrange"
            @click="openTab('choose')"
          >
            Choose
          </button>
          <button type="button" :class="{ on: focusTab === 'check' }" @click="openTab('check')">
            Check
            <span v-if="noteLints.length" class="count">{{ noteLints.length }}</span>
          </button>
          <button type="button" :class="{ on: focusTab === 'polish' }" @click="openTab('polish')">
            Polish
          </button>
        </nav>

        <div class="panel-scroll">
          <!-- NOW -->
          <section v-if="focusTab === 'now'" class="panel">
            <p class="hint">Home chords (pillars). Suggest on the lane, then Lock.</p>
            <div class="row">
              <button type="button" class="primary" @click="onInfer">Suggest pillars</button>
              <button type="button" class="step-btn" @click="onAddPillarAtPlayhead">
                Add at playhead
              </button>
              <button type="button" class="step-btn" @click="onLabelRoles">Label roles</button>
            </div>
            <div v-if="pillars.length" class="row">
              <button type="button" class="step-btn" @click="stepPillar(-1)">← Pillar</button>
              <button type="button" class="step-btn" @click="stepPillar(1)">Pillar →</button>
            </div>
            <div v-if="selectedPil" class="card">
              <label class="root-big">
                Home root
                <select
                  class="root-sel"
                  :value="selectedPil.rootPc"
                  @change="updatePillarRoot(Number(($event.target as HTMLSelectElement).value))"
                >
                  <option v-for="n in 12" :key="n - 1" :value="n - 1">
                    {{ pcName(n - 1, preferFlats) }}
                  </option>
                </select>
              </label>
              <span class="stack-state" :class="selectedPil.confirmed ? 'ok' : 'missing'">
                {{ selectedPil.confirmed ? 'locked' : 'draft' }}
              </span>
              <p v-if="selectedPil.reason" class="muted tiny">{{ selectedPil.reason }}</p>
              <div class="row">
                <button type="button" class="step-btn" @click="hearPillarRoot">Hear root</button>
                <button type="button" class="primary" @click="onLockPillar">Lock</button>
                <button type="button" class="step-btn" @click="onDeletePillar">Delete</button>
              </div>
              <button
                v-if="canLockRemaining"
                type="button"
                class="linkish"
                @click="onLockRemaining"
              >
                Lock remaining suggestions
              </button>
            </div>
            <div v-if="selectedMoment" class="card">
              <ArrangingContextCard
                v-if="momentContext"
                :ctx="momentContext"
                @hear="hearCurrentStack"
                @add-pillar="addPillarHere"
                @extend-pillar="extendPreviousToHere"
              />
              <div v-else class="note-line">
                <strong>{{ midiToNote(selectedMoment.leadMidi) }}</strong>
                <span v-if="selectedMoment.heldLead" class="post-badge">Post (held)</span>
              </div>
            </div>
            <div v-if="coverageGaps.length" class="gaps">
              <h3 class="subh">Uncovered ({{ coverageGaps.length }})</h3>
              <ul>
                <li v-for="g in coverageGaps.slice(0, 6)" :key="g.id">
                  <button
                    type="button"
                    class="lint-jump"
                    @click="arrStore.selectMelody(g.id); addPillarHere()"
                  >
                    {{ midiToNote(g.midi) }} — add pillar
                  </button>
                </li>
              </ul>
            </div>
            <button
              type="button"
              class="primary"
              :disabled="!canWalkArrange"
              @click="enterWalk"
            >
              Choose chords →
            </button>
          </section>

          <!-- CHOOSE -->
          <section v-else-if="focusTab === 'choose'" class="panel">
            <div class="row">
              <button type="button" class="step-btn" :disabled="!moments.length" @click="stepMoment(-1)">
                ← Prev
              </button>
              <button type="button" class="step-btn" :disabled="!moments.length" @click="stepMoment(1)">
                Next →
              </button>
              <button type="button" class="step-btn" @click="stepNextGap">Next gap</button>
              <button
                type="button"
                class="step-btn"
                :disabled="!currentStack?.midi"
                @click="hearCurrentStack"
              >
                Hear stack
              </button>
            </div>
            <div v-if="selectedMoment" class="card">
              <ArrangingContextCard
                v-if="momentContext"
                :ctx="momentContext"
                @hear="hearCurrentStack"
                @add-pillar="addPillarHere"
                @extend-pillar="extendPreviousToHere"
              />
              <div v-if="uncoveredSelected" class="banner">
                <p class="hint">No pillar under this moment.</p>
                <div class="row">
                  <button type="button" class="primary" @click="addPillarHere">Add pillar</button>
                  <button type="button" class="step-btn" @click="extendPreviousToHere">
                    Extend previous
                  </button>
                </div>
              </div>
              <div v-else-if="mode === 'review' && !pillars.length" class="banner">
                <p class="hint">Review — add pillars for ranked suggestions.</p>
                <button type="button" class="primary" @click="onInfer">Suggest pillars</button>
              </div>
              <template v-else>
                <button
                  type="button"
                  class="primary"
                  :disabled="!filteredCandidates.length"
                  @click="applyBest"
                >
                  {{ currentStack ? 'Replace with best' : 'Apply best' }}
                </button>
                <button
                  type="button"
                  class="step-btn"
                  :disabled="filteredCandidates.length < 1"
                  @click="compareHearTop2"
                >
                  Compare hear top 2
                </button>
              </template>
            </div>
            <ArrangingCoachAlts
              :alts-open="altsOpen"
              :alt-chips="altChips"
              :counterpart="counterpart"
              :filter-options="filterOptions"
              :cand-filter="candFilter"
              @update:alts-open="altsOpen = $event"
              @update:cand-filter="candFilter = $event"
              @apply-alt="applyAltChip"
              @apply-counterpart="applyCounterpartNow"
            />
            <ul v-if="noteLints.length" class="lint-mini">
              <li v-for="lint in noteLints" :key="lint.id" :class="lint.severity">
                <button type="button" class="lint-jump" @click="jumpToLint(lint)">
                  {{ lintRowLabel(lint) }}
                </button>
                <button v-if="canFix(lint)" type="button" class="fix-btn" @click="fixItem(lint)">
                  Fix
                </button>
              </li>
            </ul>
            <h3 class="subh">Suggestions <span class="meta">bass→tenor</span></h3>
            <ul v-if="filteredCandidates.length" class="cands">
              <li
                v-for="(c, i) in filteredCandidates"
                :key="`${c.rootPc}-${c.natureId}-${c.voicing}-${i}`"
                @mouseenter="previewCand(c)"
                @mouseleave="emit('clearGhost')"
              >
                <button type="button" class="cand" @click="previewCand(c)">
                  <strong>{{ candIdentity(c) }}</strong>
                  <span
                    class="score-bar"
                    :style="{ width: `${Math.round((c.score / maxScore) * 100)}%` }"
                  />
                  <span class="cand-meta">{{ layerHint(c) }}</span>
                </button>
                <div class="cand-actions">
                  <button type="button" @click="hearCand(c)">Hear</button>
                  <button type="button" @click="applyCand(c)">
                    {{ currentStack ? 'Replace' : 'Apply' }}
                  </button>
                  <button type="button" @click="whyIndex = whyIndex === i ? null : i">Why?</button>
                </div>
                <ArrangingCandidateWhy
                  v-if="whyIndex === i"
                  :why="whyFor(i)"
                  :show-numbers="whyShowNumbers"
                  @update:show-numbers="whyShowNumbers = $event"
                />
              </li>
            </ul>
            <p v-else-if="selectedMoment && !uncoveredSelected" class="muted">
              {{ candidates.length ? 'No suggestions match this filter.' : 'No candidates.' }}
            </p>
            <details class="advanced">
              <summary>Advanced</summary>
              <button type="button" class="linkish" @click="fillEmptyWithBest">
                Fill empty moments with best picks
              </button>
              <p class="muted tiny">Does not teach — fills gaps only.</p>
            </details>
          </section>

          <!-- CHECK -->
          <section v-else-if="focusTab === 'check'" class="panel">
            <div class="row">
              <button type="button" class="primary" @click="fixAllSafe">Fix all safe</button>
              <button
                type="button"
                class="step-btn"
                :disabled="!noteLints.length"
                @click="stepNextIssue"
              >
                Next issue
              </button>
            </div>
            <p v-if="learnHint" class="hint">{{ learnHint }}</p>
            <ArrangingIssueBoard
              :groups="issueGroups"
              :can-fix="canFix"
              :row-label="lintRowLabel"
              @jump="jumpToLint"
              @fix="fixItem"
              @learn="learnLint"
            />
          </section>

          <!-- POLISH -->
          <section v-else class="panel">
            <ArrangingReviewPolish
              :contest-profile="arrStore.current?.contestProfile ?? 'sai11'"
              :tuning-mode="arrStore.current?.tuningMode ?? 'equal'"
              :org-tip="orgTip"
              :checklist="checklist.items"
              :ready="checklist.ready"
              :how-factors="howFactors"
              :music-xml-available="musicXmlAvailable"
              @strengthen="onStrengthen"
              @polish="onPolish"
              @apply-swipe="onApplySwipe"
              @update:contest-profile="setContestProfile"
              @update:tuning-mode="setTuningMode"
              @export-midi="exportMidi"
              @export-music-xml="exportMusicXml"
            />
          </section>
        </div>
      </div>
    </template>
  </aside>
</template>

<style scoped>
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
.dock-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.4rem;
  flex: 0 0 auto;
}
.dock-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}
.qa-badge {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--muted);
  padding: 0.1rem 0.35rem;
  border: 1px solid var(--border);
  border-radius: 6px;
}
.icon-btn {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 1.15rem;
  line-height: 1;
  cursor: pointer;
  min-width: 1.6rem;
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
.back {
  border: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 650;
  cursor: pointer;
  padding: 0.15rem 0.2rem;
  white-space: nowrap;
}
.back:hover {
  color: var(--text);
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
.workspace {
  display: grid;
  grid-template-columns: 3.4rem 1fr;
  gap: 0.45rem;
  flex: 1 1 auto;
  min-height: 0;
}
.side-tabs {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.side-tabs button {
  position: relative;
  writing-mode: horizontal-tb;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0.45rem 0.2rem;
  min-height: 2.4rem;
}
.side-tabs button.on {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.side-tabs button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.dot {
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
  background: #c47a12;
}
.count {
  display: block;
  margin-top: 0.1rem;
  font-size: 0.65rem;
  font-weight: 650;
  color: var(--muted);
}
.panel-scroll {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding-right: 0.15rem;
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
.lint-jump {
  flex: 1;
  border: 0;
  background: transparent;
  text-align: left;
  font: inherit;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  cursor: pointer;
  color: var(--text);
  padding: 0;
}
.lint-jump:hover {
  text-decoration: underline;
}
.cands li {
  display: grid;
  gap: 0.25rem;
  padding: 0.3rem;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.cand {
  border: 0;
  background: transparent;
  text-align: left;
  font: inherit;
  cursor: pointer;
  display: grid;
  gap: 0.15rem;
  color: var(--text);
  padding: 0;
}
.score-bar {
  height: 3px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--accent) 55%, transparent);
}
.cand-meta {
  font-size: 0.72rem;
  color: var(--muted);
}
.cand-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.advanced {
  font-size: 0.8rem;
}
.linkish {
  width: 100%;
}
</style>
