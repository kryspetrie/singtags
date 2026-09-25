<script setup lang="ts">
/**
 * Shared chord catalog for Harmonize + Sketch/Detected popover.
 * Groups by root (all C qualities on one row) to favor width over vertical scroll.
 */
import { computed, ref } from 'vue'
import {
  optionKey,
  optionKeyFromRootPc,
  prioritizeOptionsByRank,
  type HarmonizeChordOption,
  type ChordRankHint,
} from '../../lib/tagRoll/harmonizer/chordPickOptions'
import { tagRollTip } from '../../lib/tagRoll/shortcuts'

export type RootChordGroup = {
  rootPc: number
  rootOffset: number
  /** Absolute root label e.g. C / Bb */
  nameLabel: string
  /** Roman root e.g. I / V (triad spelling when available) */
  romanLabel: string
  options: HarmonizeChordOption[]
}

const props = withDefaults(
  defineProps<{
    primary: readonly HarmonizeChordOption[]
    more: readonly HarmonizeChordOption[]
    selectedKey?: string | null
    labelMode?: 'both' | 'name' | 'roman'
    leadLabel?: string | null
    rankHints?: readonly ChordRankHint[] | null
    tonality?: number
    interaction?: 'click' | 'hold'
    emptyPrimaryText?: string
    moreToggleLabel?: (count: number, open: boolean) => string
    sectionByLead?: boolean
  }>(),
  {
    selectedKey: null,
    labelMode: 'both',
    leadLabel: null,
    rankHints: null,
    tonality: 0,
    interaction: 'click',
    emptyPrimaryText: 'No matching chords',
    sectionByLead: false,
  },
)

const emit = defineEmits<{
  pick: [option: HarmonizeChordOption]
  holdStart: [option: HarmonizeChordOption, event: PointerEvent]
  holdStop: []
}>()

const showMore = ref(false)

function rank(list: readonly HarmonizeChordOption[]): HarmonizeChordOption[] {
  if (!props.rankHints?.length) return [...list]
  return prioritizeOptionsByRank(list, props.rankHints, props.tonality)
}

function hintFor(o: HarmonizeChordOption): ChordRankHint | null {
  const hints = props.rankHints
  if (!hints?.length) return null
  const k = optionKey(o)
  for (const h of hints) {
    if (optionKeyFromRootPc(h.rootPc, h.natureId, props.tonality) === k) return h
  }
  return null
}

function suggestRank(o: HarmonizeChordOption): number | null {
  const hints = props.rankHints
  if (!hints?.length) return null
  const k = optionKey(o)
  for (let i = 0; i < hints.length; i++) {
    const h = hints[i]!
    if (optionKeyFromRootPc(h.rootPc, h.natureId, props.tonality) === k) return i
  }
  return null
}

/** Strip quality spelling to a root token for the group gutter. */
function rootNameLabel(opts: readonly HarmonizeChordOption[]): string {
  const maj = opts.find((o) => o.chordId === 'major')
  if (maj) return maj.name
  const first = opts[0]!
  // G7 → G, Am → A, Bbm7 → Bb, F#dim → F#
  const m = first.name.match(/^([A-G][#b]?)/)
  return m?.[1] ?? first.name
}

function rootRomanLabel(opts: readonly HarmonizeChordOption[]): string {
  const maj = opts.find((o) => o.chordId === 'major')
  if (maj) return maj.roman
  const first = opts[0]!
  const m = first.roman.match(/^([b#]?[ivIV]+)/)
  return m?.[1] ?? first.roman
}

function groupByRoot(options: readonly HarmonizeChordOption[]): RootChordGroup[] {
  const map = new Map<number, HarmonizeChordOption[]>()
  const order: number[] = []
  for (const o of options) {
    if (!map.has(o.rootPc)) {
      map.set(o.rootPc, [])
      order.push(o.rootPc)
    }
    map.get(o.rootPc)!.push(o)
  }
  // Prefer diatonic roots first (already mostly true), then by rootOffset.
  order.sort((a, b) => {
    const ao = map.get(a)![0]!.rootOffset
    const bo = map.get(b)![0]!.rootOffset
    const ad = map.get(a)![0]!.diatonicRoot
    const bd = map.get(b)![0]!.diatonicRoot
    if (ad !== bd) return ad ? -1 : 1
    return ao - bo
  })
  return order.map((rootPc) => {
    const opts = map.get(rootPc)!
    return {
      rootPc,
      rootOffset: opts[0]!.rootOffset,
      nameLabel: rootNameLabel(opts),
      romanLabel: rootRomanLabel(opts),
      options: opts,
    }
  })
}

const melodyOpts = computed(() => {
  if (!props.sectionByLead) return rank(props.primary)
  const all = rank([...props.primary, ...props.more])
  if (props.leadLabel == null) return rank(props.primary)
  return all.filter((o) => o.validForLead)
})

const otherOpts = computed(() => {
  if (!props.sectionByLead) return rank(props.more)
  if (props.leadLabel == null) return rank(props.more)
  const all = rank([...props.primary, ...props.more])
  return all.filter((o) => !o.validForLead)
})

const primaryGroups = computed(() =>
  groupByRoot(props.sectionByLead ? melodyOpts.value : rank(props.primary)),
)

const moreGroups = computed(() =>
  groupByRoot(props.sectionByLead ? otherOpts.value : rank(props.more)),
)

const moreCount = computed(() =>
  moreGroups.value.reduce((n, g) => n + g.options.length, 0),
)

const hasSuggestChrome = computed(
  () => !!props.rankHints?.length,
)

function chipLabel(o: HarmonizeChordOption): string {
  if (props.labelMode === 'roman') return o.roman
  // Quality-focused chip under a root gutter: "7", "m", "M7" …
  if (o.chordId === 'major') return 'maj'
  if (o.chordId === 'seventh') return '7'
  if (o.chordId === 'minor') return 'm'
  if (o.chordId === 'm7') return 'm7'
  if (o.chordId === 'maj7') return 'M7'
  if (o.chordId === 'dim') return 'dim'
  if (o.chordId === 'dim7') return '°7'
  if (o.chordId === 'half-dim') return 'ø'
  if (o.chordId === 'aug') return '+'
  if (o.chordId === 'sixth') return '6'
  if (o.chordId === 'madd6') return 'm6'
  if (o.chordId === 'ninth') return '9'
  if (o.chordId === 'add9') return 'add9'
  return o.name
}

function chipSecondary(o: HarmonizeChordOption): string | null {
  if (props.labelMode === 'roman') return o.name
  if (props.labelMode === 'name' || props.labelMode === 'both') return o.roman
  return null
}

function onClick(o: HarmonizeChordOption): void {
  if (props.interaction !== 'click') return
  emit('pick', o)
}

function onPointerDown(o: HarmonizeChordOption, e: PointerEvent): void {
  if (props.interaction !== 'hold' || e.button !== 0) return
  e.preventDefault()
  emit('pick', o)
  emit('holdStart', o, e)
}

function onPointerUp(): void {
  if (props.interaction !== 'hold') return
  emit('holdStop')
}

function titleOf(o: HarmonizeChordOption): string {
  const base = `${o.name} · ${o.roman}`
  const hint = hintFor(o)
  const rank = suggestRank(o)
  const bits: string[] = [base]
  if (rank === 0) bits.push(hint?.cadence ? 'top cadence suggestion' : 'top suggestion')
  else if (rank === 1) bits.push('strong alternative')
  else if (rank === 2) bits.push('alternative')
  if (hint?.label) bits.push(hint.label)
  if (props.interaction === 'hold') {
    if (o.validForLead && props.leadLabel) {
      bits.push(`contains Lead ${props.leadLabel}`)
      bits.push('Hold to hear')
    } else {
      bits.push('Hold to hear')
    }
    return tagRollTip(bits.join(' · '))
  }
  if (!o.validForLead) bits.push('lead not in chord')
  return tagRollTip(bits.join(' · '))
}
</script>

<template>
  <div class="chord-pick-list">
    <p v-if="hasSuggestChrome" class="suggest-legend" aria-hidden="true">
      <span class="lg best">Top</span>
      <span class="lg alt">Alt</span>
      <span class="lg cad">Cadence</span>
    </p>
    <div class="chord-scroll" role="listbox" aria-label="Chord choices">
      <p v-if="sectionByLead && leadLabel && primaryGroups.length" class="sec-label">
        Contains melody
      </p>

      <div
        v-for="g in primaryGroups"
        :key="`p-${g.rootPc}`"
        class="root-row"
      >
        <span class="root-gutter" :title="`${g.nameLabel} · ${g.romanLabel}`">
          {{ labelMode === 'roman' ? g.romanLabel : g.nameLabel }}
        </span>
        <div class="root-chips">
          <button
            v-for="o in g.options"
            :key="optionKey(o)"
            type="button"
            class="chord"
            role="option"
            :class="{
              on: selectedKey === optionKey(o),
              lead: sectionByLead && o.validForLead && leadLabel,
              muted: sectionByLead && !o.validForLead,
              'suggest-best': suggestRank(o) === 0,
              'suggest-alt': suggestRank(o) === 1 || suggestRank(o) === 2,
              'suggest-cadence': !!hintFor(o)?.cadence,
            }"
            :aria-selected="selectedKey === optionKey(o)"
            :title="titleOf(o)"
            @click="onClick(o)"
            @pointerdown="onPointerDown(o, $event)"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
            @lostpointercapture="onPointerUp"
          >
            <span
              v-if="sectionByLead && o.validForLead && leadLabel"
              class="lead-mark"
              aria-hidden="true"
            >♪</span>
            <span class="cn">{{ chipLabel(o) }}</span>
            <span v-if="chipSecondary(o)" class="cr">{{ chipSecondary(o) }}</span>
          </button>
        </div>
      </div>

      <p v-if="!primaryGroups.length && !moreGroups.length" class="empty">{{ emptyPrimaryText }}</p>
      <p v-else-if="!sectionByLead && !primaryGroups.length" class="empty">{{ emptyPrimaryText }}</p>

      <button
        v-if="moreCount"
        type="button"
        class="more-tog"
        @click="showMore = !showMore"
      >
        {{ moreLabel }}
      </button>
      <template v-if="showMore && moreGroups.length">
        <p v-if="sectionByLead" class="sec-label muted">
          {{ leadLabel ? 'Does not contain melody' : 'More qualities' }}
        </p>
        <div
          v-for="g in moreGroups"
          :key="`m-${g.rootPc}`"
          class="root-row"
        >
          <span class="root-gutter" :title="`${g.nameLabel} · ${g.romanLabel}`">
            {{ labelMode === 'roman' ? g.romanLabel : g.nameLabel }}
          </span>
          <div class="root-chips">
            <button
              v-for="o in g.options"
              :key="`m-${optionKey(o)}`"
              type="button"
              class="chord muted"
              role="option"
              :class="{ on: selectedKey === optionKey(o) }"
              :aria-selected="selectedKey === optionKey(o)"
              :title="titleOf(o)"
              @click="onClick(o)"
              @pointerdown="onPointerDown(o, $event)"
              @pointerup="onPointerUp"
              @pointercancel="onPointerUp"
              @lostpointercapture="onPointerUp"
            >
              <span class="cn">{{ chipLabel(o) }}</span>
              <span v-if="chipSecondary(o)" class="cr">{{ chipSecondary(o) }}</span>
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.chord-pick-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-height: 0;
  flex: 1 1 auto;
}
.suggest-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin: 0;
  flex: none;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--muted);
}
.suggest-legend .lg {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.suggest-legend .lg::before {
  content: '';
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 3px;
  border: 1px solid var(--border);
  box-sizing: border-box;
}
.suggest-legend .best::before {
  border-color: color-mix(in srgb, #2f7d4a 65%, var(--border));
  background: color-mix(in srgb, #2f7d4a 28%, var(--surface));
}
.suggest-legend .alt::before {
  border-color: color-mix(in srgb, #3a6ea5 55%, var(--border));
  background: color-mix(in srgb, #3a6ea5 18%, var(--surface));
}
.suggest-legend .cad::before {
  border-color: color-mix(in srgb, #c47a1a 55%, var(--border));
  background: color-mix(in srgb, #c47a1a 14%, var(--surface));
  box-shadow: inset 0 -2px 0 color-mix(in srgb, #c47a1a 80%, transparent);
}
.chord-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
  align-content: start;
  padding: 0.05rem;
}
.sec-label {
  margin: 0.15rem 0 0;
  font-size: 0.65rem;
  font-weight: 750;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--muted);
}
.sec-label.muted {
  color: var(--muted);
}
.root-row {
  display: grid;
  grid-template-columns: 2.4rem 1fr;
  gap: 0.35rem;
  align-items: start;
}
.root-gutter {
  padding-top: 0.35rem;
  font-size: 0.78rem;
  font-weight: 800;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  text-align: right;
  line-height: 1.2;
  user-select: none;
}
.root-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.22rem;
  min-width: 0;
}
.chord {
  display: inline-flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.2rem;
  min-height: 1.7rem;
  min-width: 2.4rem;
  padding: 0.15rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
  text-align: center;
  touch-action: none;
  user-select: none;
}
.chord.lead {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}
.chord.suggest-best {
  border-color: color-mix(in srgb, #2f7d4a 70%, var(--border));
  background: color-mix(in srgb, #2f7d4a 22%, var(--surface));
  font-weight: 750;
}
.chord.suggest-alt {
  border-color: color-mix(in srgb, #3a6ea5 55%, var(--border));
  background: color-mix(in srgb, #3a6ea5 14%, var(--surface));
}
.chord.suggest-cadence {
  box-shadow: inset 0 -3px 0 color-mix(in srgb, #c47a1a 85%, transparent);
}
.chord.suggest-best.suggest-cadence {
  border-color: color-mix(in srgb, #2f7d4a 55%, #c47a1a);
}
.chord.muted {
  opacity: 0.78;
}
.chord.on {
  border-color: var(--accent, #3a6ea5);
  border-width: 2px;
  outline: 2px solid color-mix(in srgb, var(--accent, #3a6ea5) 55%, transparent);
  outline-offset: 1px;
  background: color-mix(in srgb, var(--accent, #3a6ea5) 22%, var(--surface));
  font-weight: 800;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent, #3a6ea5) 35%, transparent);
}
.chord:hover {
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.chord.on:hover {
  background: color-mix(in srgb, var(--accent, #3a6ea5) 28%, var(--surface));
}
.lead-mark {
  flex: none;
  font-size: 0.68rem;
  color: var(--accent, #3a6ea5);
  font-weight: 800;
}
.cn {
  font-weight: 650;
  white-space: nowrap;
}
.cr {
  font-size: 0.62rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.more-tog {
  min-height: 1.6rem;
  border: none;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
  padding: 0.15rem 0.1rem;
}
.empty {
  margin: 0.35rem 0;
  font-size: 0.75rem;
  color: var(--muted);
}
</style>
