<script setup lang="ts">
/**
 * Arranging coach — single ordered path: Pillars → Strong/passing → Chords → Check → Polish.
 */
import { computed, onMounted, onUnmounted, ref, toRef } from 'vue'
import ArrangingContextCard from './ArrangingContextCard.vue'
import ArrangingCandidateWhy from './ArrangingCandidateWhy.vue'
import ArrangingIssueBoard from './ArrangingIssueBoard.vue'
import ArrangingStepRail from './ArrangingStepRail.vue'
import ArrangingReviewPolish from './ArrangingReviewPolish.vue'
import ArrangingCoachChrome from './ArrangingCoachChrome.vue'
import ArrangingCoachRolesPanel from './ArrangingCoachRolesPanel.vue'
import ArrangingTeachStrip from './ArrangingTeachStrip.vue'
import { glossaryIdsForGuidedStep } from '../../application/arranging/GuidedSteps'
import { glossaryTitle } from '../../lib/arranging/glossaryTooltip'
import { DEFAULT_QA_CONFIG } from '../../domain/arranging/coachConfig'
import { DEFAULT_CONTEST_PROFILE } from '../../domain/arranging/contestProfile'
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
  focusRange: [startTick: number, endTick: number, select?: 'pillar' | 'column' | 'range' | 'none']
  focusPart: [tick: number, partName: string]
  popOut: []
}>()

const inspectRangeRef = toRef(props, 'inspectRange')
const api = useArrangingCoachDock(emit, { inspectRange: inspectRangeRef })
const {
  arrStore,
  syncing,
  phase,
  mode,
  focusTab,
  whyIndex,
  whyShowNumbers,
  nextAction,
  preferFlats,
  melody,
  pillars,
  selectedMoment,
  selectedPil,
  candidates,
  filteredCandidates,
  maxScore,
  filterOptions,
  candFilter,
  altChips,
  counterpart,
  issueGroups,
  expandedLintId,
  lintDetail,
  lintParts,
  clearLintDetail,
  progressLabel,
  coverageGaps,
  noteLints,
  canWalkArrange,
  canLockRemaining,
  currentStack,
  uncoveredSelected,
  momentContext,
  ensureLinked,
  stepPillar,
  focusPillar,
  onInfer,
  onAddPillarAtPlayhead,
  onLockPillar,
  onLockRemaining,
  onDeletePillar,
  updatePillarRoot,
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
  guidedStep,
  guidedTip,
  guidedStepLabel,
  selectGuidedStep,
  selectMelodyNote,
  stepMelodyNote,
  setMelodyNoteRole,
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

const stepGlossaryIds = computed(() => glossaryIdsForGuidedStep(guidedStep.value))
const pillarGlossaryTip = glossaryTitle('pillar')

const showConfig = ref(false)
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

    <ArrangingCoachChrome
      :show-config="showConfig"
      :qa-errors="arrStore.qaBadge.errors"
      :qa-warns="arrStore.qaBadge.warns"
      :show-config-panel="showConfig && !!melody.length"
      :contest-profile="arrStore.current?.contestProfile ?? DEFAULT_CONTEST_PROFILE"
      :tuning-mode="arrStore.current?.tuningMode ?? 'equal'"
      :qa-config="arrStore.current?.qaConfig ?? DEFAULT_QA_CONFIG"
      :org-tip="orgTip"
      @toggle-config="showConfig = !showConfig"
      @pop-out="emit('popOut')"
      @close="emit('close')"
      @update:contest-profile="setContestProfile"
      @update:tuning-mode="setTuningMode"
      @update:qa-group="setQaGroup"
      @close-config="showConfig = false"
    />

    <p v-if="syncing" class="muted">Linking…</p>

    <div v-if="!melody.length" class="empty">
      <p>Enter the Lead melody on the roll first, then open Coach again.</p>
      <button type="button" class="primary" @click="goCloseForMelody">Close coach</button>
    </div>

    <template v-else>
      <div class="session-bar">
        <div class="session-meta">
          <strong>{{ guidedStepLabel }}</strong>
          <span>{{ progressLabel }}</span>
        </div>
        <button type="button" class="primary slim" @click="runNextAction">
          {{ nextAction.cta }}
        </button>
      </div>

      <ArrangingStepRail
        :active="guidedStep"
        :tip="guidedTip"
        @select="selectGuidedStep"
      />
      <ArrangingTeachStrip
        class="step-teach"
        heading="Key ideas for this step"
        :ids="stepGlossaryIds"
      />

      <div class="workspace">
        <div class="panel-scroll">
          <!-- ROLES (distinct from pillars) -->
          <ArrangingCoachRolesPanel
            v-if="focusTab === 'now' && guidedStep === 'roles'"
            :melody="melody"
            :selected-id="arrStore.selectedMelodyId"
            @select="selectMelodyNote"
            @step="stepMelodyNote"
            @set-role="setMelodyNoteRole"
            @label-all="onLabelRoles"
          />

          <!-- PILLARS -->
          <section v-else-if="focusTab === 'now'" class="panel">
            <p class="hint">
              Home roots under the melody. Suggest draws bands on the Coach lane — Hear the root, then
              Lock when it feels right.
            </p>
            <div class="row">
              <button
                type="button"
                class="primary"
                :title="
                  pillarGlossaryTip ||
                  'Guess one home root per measure from the Lead. Review and lock before arranging.'
                "
                @click="onInfer"
              >
                Suggest pillars
              </button>
              <button
                type="button"
                class="step-btn"
                title="Insert a draft pillar starting at the playhead (or selected moment)."
                @click="onAddPillarAtPlayhead"
              >
                Add at playhead
              </button>
            </div>
            <div v-if="pillars.length" class="row">
              <button
                type="button"
                class="step-btn"
                title="Previous pillar — moves the L/R inspect bounds on the roll"
                @click="stepPillar(-1)"
              >
                ← Pillar
              </button>
              <button
                type="button"
                class="step-btn"
                title="Next pillar — moves the L/R inspect bounds on the roll"
                @click="stepPillar(1)"
              >
                Pillar →
              </button>
              <button
                type="button"
                class="step-btn"
                :disabled="!canWalkArrange"
                title="Next: mark Lead notes as Strong (home) or Passing (connective)"
                @click="selectGuidedStep('roles')"
              >
                Next: Strong / passing →
              </button>
            </div>
            <ul v-if="pillars.length" class="pillar-list">
              <li v-for="(pil, i) in pillars" :key="pil.id">
                <button
                  type="button"
                  class="pillar-btn"
                  :class="{ on: pil.id === selectedPil?.id, locked: pil.confirmed }"
                  :title="
                    [
                      `Pillar ${i + 1}: ${pcName(pil.rootPc, preferFlats)}`,
                      pil.confirmed ? 'Locked home root' : 'Draft — Hear and Lock when ready',
                      pil.reason || '',
                      pillarGlossaryTip,
                    ]
                      .filter(Boolean)
                      .join(' — ')
                  "
                  @click="focusPillar(pil.id)"
                >
                  <span class="idx">{{ i + 1 }}</span>
                  <strong>{{ pcName(pil.rootPc, preferFlats) }}</strong>
                  <span class="pill-state">{{ pil.confirmed ? 'locked' : 'draft' }}</span>
                </button>
              </li>
            </ul>
            <div v-if="selectedPil" class="card">
              <label
                class="root-big"
                :title="pillarGlossaryTip || 'Pitch-class home root for this phrase'"
              >
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
              <span
                class="stack-state"
                :class="selectedPil.confirmed ? 'ok' : 'missing'"
                :title="
                  selectedPil.confirmed
                    ? 'Locked — coach treats this as a confirmed home root'
                    : 'Draft — still editable; Lock when you are happy with it'
                "
              >
                {{ selectedPil.confirmed ? 'locked' : 'draft' }}
              </span>
              <p v-if="selectedPil.reason" class="muted tiny">{{ selectedPil.reason }}</p>
              <div class="row">
                <button
                  type="button"
                  class="step-btn"
                  title="Audition this pillar’s root pitch"
                  @click="hearPillarRoot"
                >
                  Hear root
                </button>
                <button
                  type="button"
                  class="primary"
                  title="Confirm this home root so arranging can rely on it"
                  @click="onLockPillar"
                >
                  Lock
                </button>
                <button
                  type="button"
                  class="step-btn"
                  title="Remove this pillar span"
                  @click="onDeletePillar"
                >
                  Delete
                </button>
              </div>
              <button
                v-if="canLockRemaining"
                type="button"
                class="linkish"
                title="Lock every remaining draft pillar after you have locked at least one"
                @click="onLockRemaining"
              >
                Lock remaining suggestions
              </button>
            </div>
            <div v-if="coverageGaps.length" class="gaps">
              <h3 class="subh">Uncovered ({{ coverageGaps.length }})</h3>
              <ul>
                <li v-for="g in coverageGaps.slice(0, 6)" :key="g.id">
                  <button
                    type="button"
                    class="gap-jump"
                    @click="arrStore.selectMelody(g.id); addPillarHere()"
                  >
                    {{ midiToNote(g.midi) }} — add pillar
                  </button>
                </li>
              </ul>
            </div>
          </section>

          <!-- CHOOSE — best on one line; other suggestions in a single collapsible -->
          <section v-else-if="focusTab === 'choose'" class="panel">
            <div v-if="selectedMoment" class="card">
              <ArrangingContextCard
                v-if="momentContext"
                :ctx="momentContext"
                @hear="hearCurrentStack"
                @add-pillar="addPillarHere"
                @extend-pillar="extendPreviousToHere"
              />
              <div v-if="uncoveredSelected" class="banner">
                <p class="hint">
                  No pillar under this moment — lock a home root first so ranked suggestions know
                  which family to use.
                </p>
                <div class="row">
                  <button
                    type="button"
                    class="primary"
                    :title="pillarGlossaryTip || 'Add a home-root pillar covering this moment'"
                    @click="addPillarHere"
                  >
                    Add pillar
                  </button>
                  <button
                    type="button"
                    class="step-btn"
                    title="Stretch the previous pillar forward to cover this moment"
                    @click="extendPreviousToHere"
                  >
                    Extend previous
                  </button>
                </div>
              </div>
              <div v-else-if="mode === 'review' && !pillars.length" class="banner">
                <p class="hint">Review — add pillars for ranked suggestions.</p>
                <button type="button" class="primary" @click="onInfer">Suggest pillars</button>
              </div>
              <template v-else>
                <div v-if="filteredCandidates[0]" class="best-row">
                  <strong class="best-id">{{ candIdentity(filteredCandidates[0]) }}</strong>
                  <span class="cand-meta">{{ layerHint(filteredCandidates[0]) }}</span>
                  <button
                    type="button"
                    class="primary slim"
                    title="Write the top-ranked voicing into this moment"
                    @click="applyBest"
                  >
                    {{ currentStack ? 'Replace' : 'Apply' }}
                  </button>
                  <button
                    type="button"
                    class="step-btn slim"
                    :disabled="!currentStack?.midi && !filteredCandidates[0]"
                    title="Audition the current stack or the top candidate"
                    @click="currentStack?.midi ? hearCurrentStack() : hearCand(filteredCandidates[0]!)"
                  >
                    Hear
                  </button>
                  <button
                    type="button"
                    class="step-btn slim"
                    title="Explain which craft factors ranked this candidate"
                    @click="whyIndex = whyIndex === 0 ? null : 0"
                  >
                    Why?
                  </button>
                </div>
                <p v-else class="muted">
                  {{ candidates.length ? 'No suggestions match this filter.' : 'No candidates.' }}
                </p>
                <ArrangingCandidateWhy
                  v-if="whyIndex === 0 && filteredCandidates[0]"
                  :why="whyFor(0)"
                  :show-numbers="whyShowNumbers"
                  @update:show-numbers="whyShowNumbers = $event"
                />
              </template>
            </div>

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
                  ×
                </button>
              </summary>
              <p class="body">{{ lintDetail.body }}</p>
              <ul v-if="lintDetail.glossary.length" class="gloss">
                <li v-for="g in lintDetail.glossary" :key="g.id">
                  <strong>{{ g.term }}</strong> — {{ g.short }}
                </li>
              </ul>
              <p v-if="filteredCandidates.length" class="subh">Try these</p>
              <ul v-if="filteredCandidates.length" class="cands flat">
                <li
                  v-for="(c, i) in filteredCandidates.slice(0, 4)"
                  :key="`lint-${c.rootPc}-${c.natureId}-${i}`"
                  @mouseenter="previewCand(c)"
                  @mouseleave="emit('clearGhost')"
                >
                  <span class="cand-id">{{ candIdentity(c) }}</span>
                  <span class="cand-meta">{{ layerHint(c) }}</span>
                  <button type="button" class="step-btn slim" @click="hearCand(c)">Hear</button>
                  <button type="button" class="step-btn slim" @click="applyCand(c)">
                    {{ currentStack ? 'Replace' : 'Apply' }}
                  </button>
                </li>
              </ul>
            </details>

            <ul v-if="noteLints.length" class="lint-mini">
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

            <details
              v-if="filteredCandidates.length > 1 || altChips.length || counterpart"
              class="other-cands"
            >
              <summary>
                Other suggestions
                <span class="meta">{{
                  Math.max(0, filteredCandidates.length - 1) +
                  altChips.length +
                  (counterpart ? 1 : 0)
                }}</span>
              </summary>
              <div v-if="altChips.length || counterpart" class="chip-row">
                <button
                  v-for="chip in altChips"
                  :key="chip.id"
                  type="button"
                  class="chip"
                  :title="chip.reason"
                  @click="applyAltChip(chip)"
                >
                  {{ chip.label }}
                </button>
                <button
                  v-if="counterpart"
                  type="button"
                  class="chip"
                  :title="counterpart.reason"
                  @click="applyCounterpartNow"
                >
                  Counterpart → {{ counterpart.label }}
                </button>
              </div>
              <div class="filter-row" role="group" aria-label="Suggestion filter">
                <button
                  v-for="f in filterOptions"
                  :key="f.id"
                  type="button"
                  :class="{ on: candFilter === f.id }"
                  @click="candFilter = f.id"
                >
                  {{ f.label }}
                </button>
              </div>
              <ul v-if="filteredCandidates.length > 1" class="cands flat">
                <li
                  v-for="(c, i) in filteredCandidates.slice(1)"
                  :key="`${c.rootPc}-${c.natureId}-${c.voicing}-${i + 1}`"
                  @mouseenter="previewCand(c)"
                  @mouseleave="emit('clearGhost')"
                >
                  <span class="cand-id">{{ candIdentity(c) }}</span>
                  <span
                    class="score-bar"
                    :style="{ width: `${Math.round((c.score / maxScore) * 100)}%` }"
                  />
                  <span class="cand-meta">{{ layerHint(c) }}</span>
                  <button type="button" class="step-btn slim" @click="hearCand(c)">Hear</button>
                  <button type="button" class="step-btn slim" @click="applyCand(c)">
                    {{ currentStack ? 'Replace' : 'Apply' }}
                  </button>
                  <button
                    type="button"
                    class="step-btn slim"
                    @click="whyIndex = whyIndex === i + 1 ? null : i + 1"
                  >
                    Why?
                  </button>
                  <ArrangingCandidateWhy
                    v-if="whyIndex === i + 1"
                    class="why-inline"
                    :why="whyFor(i + 1)"
                    :show-numbers="whyShowNumbers"
                    @update:show-numbers="whyShowNumbers = $event"
                  />
                </li>
              </ul>
              <div class="row">
                <button
                  type="button"
                  class="step-btn"
                  :disabled="filteredCandidates.length < 2"
                  title="Play the top two ranked suggestions back-to-back"
                  @click="compareHearTop2"
                >
                  Compare top 2
                </button>
                <button
                  type="button"
                  class="linkish"
                  title="Fills empty moments with top picks — skips Apply + Why?"
                  @click="fillEmptyWithBest"
                >
                  Fill empties
                </button>
              </div>
            </details>
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
            <ArrangingIssueBoard
              :groups="issueGroups"
              :can-fix="canFix"
              :row-parts="lintParts"
              :expanded-id="expandedLintId"
              @jump="jumpToLint"
              @fix="fixItem"
              @learn="learnLint"
            />
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
              @open-config="showConfig = true"
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
.step-teach {
  flex: 0 0 auto;
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
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
.panel-scroll {
  flex: 1 1 auto;
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
