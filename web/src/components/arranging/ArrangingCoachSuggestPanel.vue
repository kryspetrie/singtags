<script setup lang="ts">
/**
 * Coach Choose — dense grid: hold to hear, ✓ to Apply/Replace; insights teach alts/cadences.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { HarmonizeCandidate } from '../../domain/arranging/harmonize'
import type { CadenceSuggestion } from '../../domain/arranging/cadences'
import type { AltChipDto, CandFilterId, CounterpartDto } from '../../application/arranging/CoachAlternates'
import ArrangingCoachTeachLesson from './ArrangingCoachTeachLesson.vue'
import ArrangingCoachCadencePlans from './ArrangingCoachCadencePlans.vue'
import ArrangingTeachProse from './ArrangingTeachProse.vue'

export type CadenceTeachView = {
  label: string
  body: string
  glossaryIds: readonly string[]
}

const props = defineProps<{
  momentLine: string
  cadenceTeach?: CadenceTeachView | null
  cadencePlans?: readonly CadenceSuggestion[]
  hearingPlanId?: string | null
  previewPlanId?: string | null
  banner?: string | null
  candidates: readonly HarmonizeCandidate[]
  selectedIndex: number
  hasStack: boolean
  identity: (c: HarmonizeCandidate) => string
  meta: (c: HarmonizeCandidate) => string
  whyOpen: boolean
  altChips: AltChipDto[]
  counterpart: CounterpartDto | null
  filterOptions: { id: CandFilterId; label: string }[]
  candFilter: CandFilterId
}>()

const emit = defineEmits<{
  'update:selectedIndex': [i: number]
  'update:candFilter': [v: CandFilterId]
  'update:whyOpen': [v: boolean]
  preview: [c: HarmonizeCandidate]
  clearPreview: []
  holdStart: [c: HarmonizeCandidate]
  holdStop: []
  apply: [c: HarmonizeCandidate]
  previewAlt: [chip: AltChipDto]
  holdStartAlt: [chip: AltChipDto]
  applyAlt: [chip: AltChipDto]
  previewCounterpart: []
  holdStartCounterpart: []
  applyCounterpart: []
  fillEmpties: []
  applyCadencePlan: [plan: CadenceSuggestion]
  applyCadenceStep: [plan: CadenceSuggestion, stepIndex: number]
  hearCadencePlan: [plan: CadenceSuggestion]
  previewCadencePlan: [plan: CadenceSuggestion]
}>()

type ToneId = 'home' | 'passing' | 'seventh' | 'other'

type GroupRow = {
  label: string
  tone: ToneId
  items: { c: HarmonizeCandidate; i: number }[]
}

function toneFor(c: HarmonizeCandidate): ToneId {
  if (c.natureId === 'seventh' || c.natureId === 'ninth') return 'seventh'
  if (c.layer === 'primary') return 'home'
  if (c.layer === 'passing' || c.scfGroup != null) return 'passing'
  return 'other'
}

/** Preserve rank order; section headers from layer hint (home family / passing…). */
const groups = computed((): GroupRow[] => {
  const order: string[] = []
  const map = new Map<string, { c: HarmonizeCandidate; i: number; tone: ToneId }[]>()
  props.candidates.forEach((c, i) => {
    const label = props.meta(c) || 'other'
    const tone = toneFor(c)
    if (!map.has(label)) {
      map.set(label, [])
      order.push(label)
    }
    map.get(label)!.push({ c, i, tone })
  })
  return order.map((label) => {
    const raw = map.get(label)!
    return {
      label,
      tone: raw[0]!.tone,
      items: raw.map(({ c, i }) => ({ c, i })),
    }
  })
})

function onHoldStart(i: number, c: HarmonizeCandidate, e: PointerEvent): void {
  if (e.button !== 0) return
  e.preventDefault()
  emit('update:selectedIndex', i)
  emit('preview', c)
  emit('holdStart', c)
}

function onHoldStop(): void {
  emit('holdStop')
  emit('clearPreview')
}

function onApplyToggle(i: number, c: HarmonizeCandidate, e: Event): void {
  e.stopPropagation()
  emit('update:selectedIndex', i)
  emit('apply', c)
}

function onAltHoldStart(chip: AltChipDto, e: PointerEvent): void {
  if (e.button !== 0) return
  e.preventDefault()
  emit('previewAlt', chip)
  emit('holdStartAlt', chip)
}

function onCounterpartHoldStart(e: PointerEvent): void {
  if (e.button !== 0) return
  e.preventDefault()
  emit('previewCounterpart')
  emit('holdStartCounterpart')
}

const cadenceLearnOpen = ref(false)
const planTeach = ref<CadenceSuggestion | null>(null)
const moreOpen = ref(false)
const moreWrapRef = ref<HTMLElement | null>(null)

function onFillEmpties(): void {
  moreOpen.value = false
  emit('fillEmpties')
}

function onDocPointer(e: PointerEvent): void {
  const el = e.target as HTMLElement | null
  if (moreOpen.value && !el?.closest?.('.more-wrap')) moreOpen.value = false
}

onMounted(() => document.addEventListener('pointerdown', onDocPointer, true))
onUnmounted(() => document.removeEventListener('pointerdown', onDocPointer, true))
</script>

<template>
  <section class="suggest-panel">
    <ArrangingCoachTeachLesson
      v-if="planTeach"
      :title="`Cadence · ${planTeach.label}`"
      :glossary-ids="planTeach.glossaryIds"
      :intro="planTeach.teach"
      @back="planTeach = null"
    />
    <ArrangingCoachTeachLesson
      v-else-if="cadenceLearnOpen && cadenceTeach"
      :title="`Cadence · ${cadenceTeach.label}`"
      :glossary-ids="cadenceTeach.glossaryIds"
      :intro="cadenceTeach.body"
      @back="cadenceLearnOpen = false"
    />

    <template v-else>
    <header v-if="momentLine" class="moment-strip">
      <span class="moment-line">{{ momentLine }}</span>
    </header>

    <p v-if="banner" class="banner">{{ banner }}</p>

    <template v-else>
      <p class="meta">Hold to hear · ✓ {{ hasStack ? 'Replace' : 'Apply' }}</p>

      <div
        v-if="filterOptions.length > 1"
        class="filter-row"
        role="group"
        aria-label="Filter ranked chords"
      >
        <button
          v-for="f in filterOptions"
          :key="f.id"
          type="button"
          class="filter-chip"
          :class="[f.id, { on: candFilter === f.id }]"
          @click="emit('update:candFilter', f.id)"
        >
          {{ f.label }}
        </button>
      </div>

      <p v-if="!candidates.length" class="empty">No candidates for this moment.</p>
      <div v-else class="groups" role="listbox" aria-label="Coach suggestions">
        <section v-for="g in groups" :key="g.label" class="group" :data-tone="g.tone">
          <h3 class="group-label" :data-tone="g.tone">{{ g.label }}</h3>
          <ul class="suggest-grid">
            <li
              v-for="{ c, i } in g.items"
              :key="`${c.rootPc}-${c.natureId}-${c.voicing}-${i}`"
              class="cell"
              :class="[
                toneFor(c),
                {
                  on: i === selectedIndex,
                  'rank-top': i < 3,
                  [`rank-${i + 1}`]: i < 3,
                },
              ]"
            >
              <span class="rank" :aria-label="`Rank ${i + 1}`">{{ i + 1 }}</span>
              <button
                type="button"
                class="hear"
                role="option"
                :aria-selected="i === selectedIndex"
                :title="`#${i + 1} · ${identity(c)} · ${g.label} · Hold to hear`"
                @pointerdown="onHoldStart(i, c, $event)"
                @pointerup="onHoldStop"
                @pointercancel="onHoldStop"
                @lostpointercapture="onHoldStop"
                @pointerleave="onHoldStop"
              >
                {{ identity(c) }}
              </button>
              <button
                type="button"
                class="apply"
                :title="hasStack ? 'Replace with this voicing' : 'Apply this voicing'"
                :aria-label="hasStack ? `Replace with ${identity(c)}` : `Apply ${identity(c)}`"
                @click="onApplyToggle(i, c, $event)"
              >
                ✓
              </button>
            </li>
          </ul>
        </section>
      </div>

      <div class="quick-row">
        <button
          type="button"
          class="linkish"
          :class="{ on: whyOpen }"
          :disabled="!candidates[0]"
          :aria-pressed="whyOpen"
          title="Open Why? ranking dock to the left"
          @click="emit('update:whyOpen', !whyOpen)"
        >
          {{ whyOpen ? 'Hide Why?' : 'Why?' }}
        </button>
        <div ref="moreWrapRef" class="more-wrap">
          <button
            type="button"
            class="more-btn"
            :aria-expanded="moreOpen"
            aria-label="More chord actions"
            title="More"
            @click="moreOpen = !moreOpen"
          >
            <font-awesome-icon :icon="['fas', 'ellipsis-vertical']" aria-hidden="true" />
          </button>
          <div v-if="moreOpen" class="more-menu" role="menu">
            <button type="button" role="menuitem" @click="onFillEmpties">Fill empties</button>
          </div>
        </div>
      </div>

      <aside v-if="cadenceTeach" class="cadence-teach">
        <div class="cadence-head">
          <strong>Cadence · {{ cadenceTeach.label }}</strong>
          <button
            type="button"
            class="learn"
            title="Open full cadence lesson with examples"
            @click="cadenceLearnOpen = true"
          >
            Learn
          </button>
        </div>
        <ArrangingTeachProse class="cadence-body" :text="cadenceTeach.body" />
      </aside>

      <ArrangingCoachCadencePlans
        v-if="cadencePlans?.length"
        :plans="cadencePlans"
        :hearing-plan-id="hearingPlanId"
        :preview-plan-id="previewPlanId"
        @apply-plan="emit('applyCadencePlan', $event)"
        @apply-step="(plan, i) => emit('applyCadenceStep', plan, i)"
        @learn="planTeach = $event"
        @hear="emit('hearCadencePlan', $event)"
        @preview="emit('previewCadencePlan', $event)"
      />

      <div v-if="altChips.length || counterpart" class="alt-block">
        <h4 class="insight-sub">Theory alternates</h4>
        <ul class="suggest-grid alts">
          <li v-for="chip in altChips" :key="chip.id" class="cell">
            <button
              type="button"
              class="hear"
              :title="`${chip.reason} · Hold to hear`"
              @pointerdown="onAltHoldStart(chip, $event)"
              @pointerup="onHoldStop"
              @pointercancel="onHoldStop"
              @lostpointercapture="onHoldStop"
              @pointerleave="onHoldStop"
            >
              <span class="alt-label">{{ chip.label }}</span>
              <span class="alt-reason">{{ chip.reason }}</span>
            </button>
            <button
              type="button"
              class="apply"
              :title="chip.reason"
              :aria-label="`Apply ${chip.label}`"
              @click="emit('applyAlt', chip)"
            >
              ✓
            </button>
          </li>
          <li v-if="counterpart" class="cell">
            <button
              type="button"
              class="hear"
              :title="`${counterpart.reason} · Hold to hear`"
              @pointerdown="onCounterpartHoldStart($event)"
              @pointerup="onHoldStop"
              @pointercancel="onHoldStop"
              @lostpointercapture="onHoldStop"
              @pointerleave="onHoldStop"
            >
              <span class="alt-label">Counterpart → {{ counterpart.label }}</span>
              <span class="alt-reason">{{ counterpart.reason }}</span>
            </button>
            <button
              type="button"
              class="apply"
              :title="counterpart.reason"
              :aria-label="`Apply counterpart ${counterpart.label}`"
              @click="emit('applyCounterpart')"
            >
              ✓
            </button>
          </li>
        </ul>
      </div>

    </template>
    </template>
  </section>
</template>

<style scoped>
.suggest-panel {
  display: grid;
  gap: 0.4rem;
}
.moment-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.55rem;
  font-size: 0.8rem;
}
.moment-line {
  font-weight: 650;
  min-width: 0;
}
.banner {
  margin: 0;
  padding: 0.45rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.8rem;
  color: var(--muted);
  background: color-mix(in srgb, var(--bg) 70%, var(--surface));
}
.meta {
  margin: 0;
  font-size: 0.72rem;
  color: var(--muted);
}
.empty {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted);
}
.groups {
  display: grid;
  gap: 0.45rem;
}
.group {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
}
.group-label {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: capitalize;
  color: var(--muted);
  letter-spacing: 0.02em;
}
.group-label[data-tone='home'] {
  color: color-mix(in srgb, #2a8c5a 70%, var(--text));
}
.group-label[data-tone='passing'] {
  color: color-mix(in srgb, #c47a12 75%, var(--text));
}
.group-label[data-tone='seventh'] {
  color: color-mix(in srgb, #3d6ea8 75%, var(--text));
}
.suggest-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.28rem;
}
.suggest-grid.alts {
  grid-template-columns: 1fr;
}
.cell {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: stretch;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  overflow: hidden;
  min-width: 0;
  min-height: 1.85rem;
}
.rank {
  display: grid;
  place-items: center;
  min-width: 1.2rem;
  padding: 0 0.15rem;
  border-right: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg) 55%, var(--surface));
  color: var(--muted);
  font-size: 0.68rem;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.cell.rank-top .rank {
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
}
.cell.rank-1 {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent);
}
.cell.rank-1 .rank {
  background: color-mix(in srgb, var(--accent) 22%, var(--surface));
  color: var(--text);
}
.cell.rank-2 {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
}
.cell.rank-3 {
  border-color: color-mix(in srgb, var(--accent) 22%, var(--border));
}
.cell.home {
  border-color: color-mix(in srgb, #2a8c5a 35%, var(--border));
  background: color-mix(in srgb, #2a8c5a 8%, var(--surface));
}
.cell.passing {
  border-color: color-mix(in srgb, #c47a12 38%, var(--border));
  background: color-mix(in srgb, #c47a12 9%, var(--surface));
}
.cell.seventh {
  border-color: color-mix(in srgb, #3d6ea8 40%, var(--border));
  background: color-mix(in srgb, #3d6ea8 10%, var(--surface));
}
.cell.rank-1.home,
.cell.rank-1.passing,
.cell.rank-1.seventh {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent);
}
.cell.on {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
}
.suggest-grid.alts .cell {
  grid-template-columns: 1fr auto;
}
.suggest-grid.alts .rank {
  display: none;
}
.hear {
  min-width: 0;
  height: 100%;
  padding: 0.2rem 0.4rem;
  border: none;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 0.78rem;
  text-align: left;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  overflow: hidden;
}
.groups .hear {
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell.on .hear {
  font-weight: 700;
}
.alt-label {
  display: block;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.alt-reason {
  display: block;
  margin-top: 0.1rem;
  font-size: 0.68rem;
  color: var(--muted);
  font-weight: 500;
  line-height: 1.25;
  white-space: normal;
}
.apply {
  display: grid;
  place-items: center;
  min-width: 1.65rem;
  align-self: stretch;
  padding: 0 0.25rem;
  border: none;
  border-left: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg) 55%, var(--surface));
  color: var(--accent, #0f6b5c);
  font: inherit;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}
.apply:hover {
  background: color-mix(in srgb, var(--accent, #0f6b5c) 16%, var(--surface));
}
.quick-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.75rem;
}
.linkish {
  border: none;
  background: none;
  padding: 0;
  color: var(--accent, #0f6b5c);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 650;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.linkish:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  text-decoration: none;
}
.linkish.on {
  font-weight: 750;
}
.more-wrap {
  position: relative;
  margin-left: auto;
}
.more-btn {
  display: grid;
  place-items: center;
  width: 1.7rem;
  height: 1.7rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
  font: inherit;
}
.more-btn:hover,
.more-btn[aria-expanded='true'] {
  color: var(--text);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.more-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 20;
  min-width: 9.5rem;
  display: grid;
  padding: 0.2rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 8px 20px color-mix(in srgb, #000 12%, transparent);
}
.more-menu button {
  text-align: left;
  min-height: 2rem;
  padding: 0.3rem 0.5rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 650;
  cursor: pointer;
}
.more-menu button:hover {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.cadence-teach {
  display: grid;
  gap: 0.25rem;
  padding: 0.4rem 0.45rem;
  border-radius: 7px;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.cadence-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.35rem;
}
.cadence-teach strong {
  font-size: 0.78rem;
}
.cadence-teach .learn {
  flex-shrink: 0;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0.1rem 0.35rem;
}
.cadence-body {
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--text);
}
.insight-sub {
  margin: 0 0 0.25rem;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.alt-block {
  display: grid;
  gap: 0.25rem;
}
.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.filter-chip {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.15rem 0.4rem;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.72rem;
  cursor: pointer;
}
.filter-chip.pcf {
  border-color: color-mix(in srgb, #2a8c5a 40%, var(--border));
  color: color-mix(in srgb, #2a8c5a 65%, var(--muted));
}
.filter-chip.scf {
  border-color: color-mix(in srgb, #c47a12 42%, var(--border));
  color: color-mix(in srgb, #c47a12 70%, var(--muted));
}
.filter-chip.sevenths {
  border-color: color-mix(in srgb, #3d6ea8 42%, var(--border));
  color: color-mix(in srgb, #3d6ea8 70%, var(--muted));
}
.filter-chip.on {
  color: var(--text);
  font-weight: 650;
  background: var(--surface);
}
.filter-chip.pcf.on {
  background: color-mix(in srgb, #2a8c5a 14%, var(--surface));
}
.filter-chip.scf.on {
  background: color-mix(in srgb, #c47a12 16%, var(--surface));
}
.filter-chip.sevenths.on {
  background: color-mix(in srgb, #3d6ea8 16%, var(--surface));
}
@media (max-width: 28rem) {
  .groups .suggest-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 18rem) {
  .groups .suggest-grid {
    grid-template-columns: 1fr;
  }
}
</style>
