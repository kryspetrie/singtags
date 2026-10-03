<script setup lang="ts">
/**
 * Sheet engraving format — collapsible groups; inch margins drive packing.
 */
import { computed, ref, watch } from 'vue'
import type { TagRollProject } from '../../lib/tagRoll/types'
import {
  SHEET_BOTTOM_MARGIN_MAX,
  SHEET_BOTTOM_MARGIN_MIN,
  SHEET_CLEF_GUTTER_MAX,
  SHEET_CLEF_GUTTER_MIN,
  SHEET_ENGRAVING_SCALE_MAX,
  SHEET_ENGRAVING_SCALE_MIN,
  SHEET_LYRIC_SIZE_MAX,
  SHEET_LYRIC_SIZE_MIN,
  SHEET_LYRIC_LINE_OFFSET_MAX,
  SHEET_LYRIC_LINE_OFFSET_MIN,
  SHEET_MARGIN_IN_MAX,
  SHEET_MARGIN_IN_MIN,
  SHEET_MEASURE_SCALE_MAX,
  SHEET_MEASURE_SCALE_MIN,
  SHEET_MIN_BAR_MAX,
  SHEET_MIN_BAR_MIN,
  SHEET_SCORE_SCALE_MAX,
  SHEET_SCORE_SCALE_MIN,
  SHEET_STAFF_LINE_MAX,
  SHEET_STAFF_LINE_MIN,
  SHEET_STAVE_GAP_FINE_MAX,
  SHEET_STAVE_GAP_FINE_MIN,
  SHEET_SYSTEM_GAP_MAX,
  SHEET_SYSTEM_GAP_MIN,
  SHEET_TOP_MARGIN_MAX,
  SHEET_TOP_MARGIN_MIN,
  defaultSheetFormat,
} from '../../lib/tagRoll/sheetFormat'
import {
  SHEET_MUSIC_FONT_CHOICES,
  SHEET_TEXT_FONT_CHOICES,
} from '../../lib/tagRoll/sheetFonts'
import {
  isA4Page,
  isLetterPage,
  SHEET_PAGE_HEIGHT_IN_MAX,
  SHEET_PAGE_HEIGHT_IN_MIN,
  SHEET_PAGE_WIDTH_IN_MAX,
  SHEET_PAGE_WIDTH_IN_MIN,
  sheetPageHeightPx,
  sheetPageWidthPx,
} from '../../lib/tagRoll/sheetPage'
import { TAG_ROLL_DEFAULT_VIEW } from '../../lib/tagRoll/types'
import type { TagRollSheetMusicFont, TagRollSheetTextFont } from '../../lib/tagRoll/types'
import { tagRollTip } from '../../lib/tagRoll/shortcuts'
import { useTagRollStore } from '../../stores/tagRoll'

const props = defineProps<{
  project: TagRollProject
}>()

defineEmits<{
  close: []
}>()

const store = useTagRollStore()
const linkMargins = ref(true)

const open = ref({
  scale: true,
  margins: true,
  spacing: true,
  measures: true,
  lyrics: true,
  page: true,
  advanced: false,
})

const layout = computed(() => props.project.view.sheetLayout ?? 'continuous')
const sizing = computed(() => props.project.view.sheetMeasureSizing ?? 'equal')
const isPage = computed(() => layout.value === 'page')
const isEqual = computed(() => sizing.value === 'equal')
const isDynamic = computed(() => sizing.value === 'dynamic')
const layoutLabel = computed(() => (isPage.value ? 'Page' : 'Continuous'))
/** Bumped when save/clear so the footer re-reads localStorage. */
const defaultTick = ref(0)
const hasCustomDefault = computed(() => {
  defaultTick.value
  return store.hasCustomSheetFormatDefault()
})
const hasLyricOffsets = computed(() =>
  Object.values(props.project.view.sheetLyricOffsets ?? {}).some((v) => v !== 0),
)

function onSaveDefault(): void {
  store.saveSheetFormatAsDefault()
  defaultTick.value++
}

function onClearDefault(): void {
  store.clearSheetFormatDefault()
  defaultTick.value++
}

const mL = computed(() => props.project.view.sheetMarginLeftIn ?? TAG_ROLL_DEFAULT_VIEW.sheetMarginLeftIn)
const mR = computed(() => props.project.view.sheetMarginRightIn ?? TAG_ROLL_DEFAULT_VIEW.sheetMarginRightIn)
const mT = computed(() => props.project.view.sheetMarginTopIn ?? TAG_ROLL_DEFAULT_VIEW.sheetMarginTopIn)
const mB = computed(() => props.project.view.sheetMarginBottomIn ?? TAG_ROLL_DEFAULT_VIEW.sheetMarginBottomIn)

watch(
  () => [mL.value, mR.value, mT.value, mB.value] as const,
  ([l, r, t, b]) => {
    const equal =
      Math.abs(l - r) < 0.001 &&
      Math.abs(l - t) < 0.001 &&
      Math.abs(l - b) < 0.001
    if (!equal) linkMargins.value = false
  },
)

const pageWIn = computed(() => props.project.view.sheetPageWidthIn ?? 8.5)
const pageHIn = computed(() => props.project.view.sheetPageHeightIn ?? 11)
const pageDpi = computed(() => props.project.view.sheetPageDpi ?? 96)
const pagePxLabel = computed(
  () =>
    `${sheetPageWidthPx(pageWIn.value, pageDpi.value)} × ${sheetPageHeightPx(pageHIn.value, pageDpi.value)} px`,
)

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

function lyricOffsetLabel(v: number): string {
  if (v === 0) return '0'
  return v > 0 ? `+${v}` : `${v}`
}

function onLyricOffset(partId: string, e: Event): void {
  store.setSheetLyricOffset(partId, Number((e.target as HTMLInputElement).value))
}

function inches(v: number): string {
  return `${v.toFixed(2)}″`
}

function toggleChecked(setter: (on: boolean) => void, e: Event): void {
  setter((e.target as HTMLInputElement).checked)
}

function onStaveGap(e: Event): void {
  const v = (e.target as HTMLSelectElement).value
  store.setSheetStaveGap(v === 'tight' || v === 'wide' ? v : 'normal')
}

function onMargin(side: 'all' | 'left' | 'right' | 'top' | 'bottom', e: Event): void {
  const v = Number((e.target as HTMLInputElement).value)
  if (!Number.isFinite(v)) return
  if (side === 'all' || linkMargins.value) {
    store.setSheetMarginsUniformIn(v)
    linkMargins.value = true
    return
  }
  switch (side) {
    case 'left':
      store.setSheetMarginLeftIn(v)
      break
    case 'right':
      store.setSheetMarginRightIn(v)
      break
    case 'top':
      store.setSheetMarginTopIn(v)
      break
    case 'bottom':
      store.setSheetMarginBottomIn(v)
      break
  }
}

function onLinkMargins(e: Event): void {
  const on = (e.target as HTMLInputElement).checked
  linkMargins.value = on
  if (on) store.setSheetMarginsUniformIn(mL.value)
}

function numInput(name: keyof ReturnType<typeof defaultSheetFormat>, e: Event): void {
  const v = Number((e.target as HTMLInputElement).value)
  switch (name) {
    case 'sheetMeasureScale':
      store.setSheetMeasureScale(v)
      break
    case 'sheetNoteSpacing':
      store.setSheetNoteSpacing(v)
      break
    case 'sheetStaveGapFine':
      store.setSheetStaveGapFine(v)
      break
    case 'sheetSystemGap':
      store.setSheetSystemGap(v)
      break
    case 'sheetTopMargin':
      store.setSheetTopMargin(v)
      break
    case 'sheetBottomMargin':
      store.setSheetBottomMargin(v)
      break
    case 'sheetLyricSize':
      store.setSheetLyricSize(v)
      break
    case 'sheetMinBarWidth':
      store.setSheetMinBarWidth(v)
      break
    case 'sheetClefGutter':
      store.setSheetClefGutter(v)
      break
    case 'sheetStaffLineWeight':
      store.setSheetStaffLineWeight(v)
      break
    case 'sheetPageWidthIn':
      store.setSheetPageWidthIn(v)
      break
    case 'sheetPageHeightIn':
      store.setSheetPageHeightIn(v)
      break
    case 'sheetEngravingScale':
      store.setSheetEngravingScale(v)
      break
    case 'sheetScoreScale':
      store.setSheetScoreScale(v)
      break
    default:
      break
  }
}

function onMusicFont(e: Event): void {
  store.setSheetMusicFont((e.target as HTMLSelectElement).value as TagRollSheetMusicFont)
}

function onTextFont(e: Event): void {
  store.setSheetTextFont((e.target as HTMLSelectElement).value as TagRollSheetTextFont)
}

function onGroupToggle(key: keyof typeof open.value, e: Event): void {
  open.value[key] = (e.target as HTMLDetailsElement).open
}
</script>

<template>
  <section class="format-panel" aria-label="Sheet format">
    <header class="head">
      <div>
        <h3 class="title">Sheet format</h3>
        <p class="hint">
          <strong>{{ layout }}</strong> · <strong>{{ sizing }}</strong>. Media-bar
          <strong>W</strong> is viewport zoom; Score / Notation scales change engraving.
        </p>
      </div>
      <button type="button" class="close" title="Close" @click="$emit('close')">✕</button>
    </header>

    <div class="scroll">
      <details
        class="group"
        :open="open.scale"
        @toggle="onGroupToggle('scale', $event)"
      >
        <summary class="group-title">Scale</summary>
        <div class="group-body">
          <label
            class="slider-row"
            :title="tagRollTip('Overall size of score content inside the margins')"
          >
            <span class="slider-label">Score</span>
            <span class="slider-val">{{ pct(project.view.sheetScoreScale ?? 1) }}</span>
            <input
              type="range"
              class="slider"
              :min="SHEET_SCORE_SCALE_MIN"
              :max="SHEET_SCORE_SCALE_MAX"
              step="0.05"
              :value="project.view.sheetScoreScale ?? 1"
              @input="numInput('sheetScoreScale', $event)"
            />
          </label>
          <label
            class="slider-row"
            :title="tagRollTip('Staff-line spacing and music glyphs')"
          >
            <span class="slider-label">Notation</span>
            <span class="slider-val">{{ pct(project.view.sheetEngravingScale ?? 1) }}</span>
            <input
              type="range"
              class="slider"
              :min="SHEET_ENGRAVING_SCALE_MIN"
              :max="SHEET_ENGRAVING_SCALE_MAX"
              step="0.05"
              :value="project.view.sheetEngravingScale ?? 1"
              @input="numInput('sheetEngravingScale', $event)"
            />
          </label>
        </div>
      </details>

      <details
        class="group"
        :open="open.margins"
        @toggle="onGroupToggle('margins', $event)"
      >
        <summary class="group-title">Margins</summary>
        <div class="group-body">
          <p class="page-hint">
            Inches from the page/strip edge. Linked keeps all four equal.
          </p>
          <label class="toggle-row" :class="{ on: linkMargins }">
            <span class="toggle-title">Link all sides</span>
            <input
              type="checkbox"
              class="setting-switch"
              role="switch"
              :checked="linkMargins"
              @change="onLinkMargins"
            />
          </label>
          <label
            v-if="linkMargins"
            class="slider-row"
            :title="tagRollTip('Same margin on all sides')"
          >
            <span class="slider-label">All</span>
            <span class="slider-val">{{ inches(mL) }}</span>
            <input
              type="range"
              class="slider"
              :min="SHEET_MARGIN_IN_MIN"
              :max="SHEET_MARGIN_IN_MAX"
              step="0.05"
              :value="mL"
              @input="onMargin('all', $event)"
            />
          </label>
          <template v-else>
            <label class="slider-row">
              <span class="slider-label">Left</span>
              <span class="slider-val">{{ inches(mL) }}</span>
              <input
                type="range"
                class="slider"
                :min="SHEET_MARGIN_IN_MIN"
                :max="SHEET_MARGIN_IN_MAX"
                step="0.05"
                :value="mL"
                @input="onMargin('left', $event)"
              />
            </label>
            <label class="slider-row">
              <span class="slider-label">Right</span>
              <span class="slider-val">{{ inches(mR) }}</span>
              <input
                type="range"
                class="slider"
                :min="SHEET_MARGIN_IN_MIN"
                :max="SHEET_MARGIN_IN_MAX"
                step="0.05"
                :value="mR"
                @input="onMargin('right', $event)"
              />
            </label>
            <label class="slider-row">
              <span class="slider-label">Top</span>
              <span class="slider-val">{{ inches(mT) }}</span>
              <input
                type="range"
                class="slider"
                :min="SHEET_MARGIN_IN_MIN"
                :max="SHEET_MARGIN_IN_MAX"
                step="0.05"
                :value="mT"
                @input="onMargin('top', $event)"
              />
            </label>
            <label class="slider-row">
              <span class="slider-label">Bottom</span>
              <span class="slider-val">{{ inches(mB) }}</span>
              <input
                type="range"
                class="slider"
                :min="SHEET_MARGIN_IN_MIN"
                :max="SHEET_MARGIN_IN_MAX"
                step="0.05"
                :value="mB"
                @input="onMargin('bottom', $event)"
              />
            </label>
          </template>
          <div class="num-grid" aria-label="Margin inches">
            <label class="num-field">
              <span>L</span>
              <input
                type="number"
                :min="SHEET_MARGIN_IN_MIN"
                :max="SHEET_MARGIN_IN_MAX"
                step="0.05"
                :value="mL"
                @change="onMargin(linkMargins ? 'all' : 'left', $event)"
              />
            </label>
            <label class="num-field">
              <span>R</span>
              <input
                type="number"
                :min="SHEET_MARGIN_IN_MIN"
                :max="SHEET_MARGIN_IN_MAX"
                step="0.05"
                :value="mR"
                :disabled="linkMargins"
                @change="onMargin('right', $event)"
              />
            </label>
            <label class="num-field">
              <span>T</span>
              <input
                type="number"
                :min="SHEET_MARGIN_IN_MIN"
                :max="SHEET_MARGIN_IN_MAX"
                step="0.05"
                :value="mT"
                :disabled="linkMargins"
                @change="onMargin('top', $event)"
              />
            </label>
            <label class="num-field">
              <span>B</span>
              <input
                type="number"
                :min="SHEET_MARGIN_IN_MIN"
                :max="SHEET_MARGIN_IN_MAX"
                step="0.05"
                :value="mB"
                :disabled="linkMargins"
                @change="onMargin('bottom', $event)"
              />
            </label>
          </div>
        </div>
      </details>

      <details
        class="group"
        :open="open.spacing"
        @toggle="onGroupToggle('spacing', $event)"
      >
        <summary class="group-title">Spacing</summary>
        <div class="group-body">
          <label class="inline-row">
            <span>Clef preset</span>
            <select
              class="sel"
              :value="project.view.sheetStaveGap ?? 'tight'"
              @change="onStaveGap"
            >
              <option value="tight">Tight</option>
              <option value="normal">Normal</option>
              <option value="wide">Wide</option>
            </select>
          </label>
          <label
            class="slider-row"
            :title="tagRollTip('Space between treble and bass clefs on the grand staff')"
          >
            <span class="slider-label">Between clefs</span>
            <span class="slider-val">{{ pct(project.view.sheetStaveGapFine ?? 1) }}</span>
            <input
              type="range"
              class="slider"
              :min="SHEET_STAVE_GAP_FINE_MIN"
              :max="SHEET_STAVE_GAP_FINE_MAX"
              step="0.05"
              :value="project.view.sheetStaveGapFine ?? 1"
              @input="numInput('sheetStaveGapFine', $event)"
            />
          </label>
          <label
            class="slider-row"
            :title="tagRollTip('Vertical gap between wrapped grand-staff rows (systems)')"
          >
            <span class="slider-label">System rows</span>
            <span class="slider-val">{{ pct(project.view.sheetSystemGap ?? 1) }}</span>
            <input
              type="range"
              class="slider"
              :min="SHEET_SYSTEM_GAP_MIN"
              :max="SHEET_SYSTEM_GAP_MAX"
              step="0.05"
              :value="project.view.sheetSystemGap ?? 1"
              @input="numInput('sheetSystemGap', $event)"
            />
          </label>
          <p v-if="!isPage" class="page-hint">
            System rows applies when measures wrap (Page layout).
          </p>
        </div>
      </details>

      <details
        class="group"
        :open="open.measures"
        @toggle="onGroupToggle('measures', $event)"
      >
        <summary class="group-title">Measure sizing</summary>
        <div class="group-body">
          <div class="segment" role="group" aria-label="Measure sizing">
            <button
              type="button"
              class="seg-btn"
              :class="{ on: isEqual }"
              :aria-pressed="isEqual"
              @click="store.setSheetMeasureSizing('equal')"
            >
              Equal
            </button>
            <button
              type="button"
              class="seg-btn"
              :class="{ on: isDynamic }"
              :aria-pressed="isDynamic"
              @click="store.setSheetMeasureSizing('dynamic')"
            >
              Dynamic
            </button>
          </div>
          <p class="page-hint">
            {{
              isDynamic
                ? 'Sparse bars shrink; busy bars grow.'
                : 'Every bar the same beat-proportional width.'
            }}
          </p>
          <label
            class="slider-row"
            :title="tagRollTip('Scale all measure widths (complements score scale)')"
          >
            <span class="slider-label">Bar width</span>
            <span class="slider-val">{{ pct(project.view.sheetMeasureScale ?? 1) }}</span>
            <input
              type="range"
              class="slider"
              :min="SHEET_MEASURE_SCALE_MIN"
              :max="SHEET_MEASURE_SCALE_MAX"
              step="0.05"
              :value="project.view.sheetMeasureScale ?? 1"
              @input="numInput('sheetMeasureScale', $event)"
            />
          </label>
        </div>
      </details>

      <details
        class="group"
        :open="open.lyrics"
        @toggle="onGroupToggle('lyrics', $event)"
      >
        <summary class="group-title">Lyrics &amp; title</summary>
        <div class="group-body">
          <label
            class="toggle-row"
            :class="{ on: project.view.sheetShowLyrics !== false }"
          >
            <span class="toggle-title">Show lyrics</span>
            <input
              type="checkbox"
              class="setting-switch"
              role="switch"
              :checked="project.view.sheetShowLyrics !== false"
              @change="toggleChecked(store.setSheetShowLyrics, $event)"
            />
          </label>
          <label
            v-if="project.view.sheetShowLyrics !== false"
            class="slider-row"
          >
            <span class="slider-label">Lyric size</span>
            <span class="slider-val">{{ project.view.sheetLyricSize ?? 11 }}px</span>
            <input
              type="range"
              class="slider"
              :min="SHEET_LYRIC_SIZE_MIN"
              :max="SHEET_LYRIC_SIZE_MAX"
              step="1"
              :value="project.view.sheetLyricSize ?? 11"
              @input="numInput('sheetLyricSize', $event)"
            />
          </label>
          <template v-if="project.view.sheetShowLyrics !== false">
            <p class="hint">Move each part’s lyric line below its staff.</p>
            <label
              v-for="part in project.parts"
              :key="part.id"
              class="slider-row"
              :title="tagRollTip(`Vertical nudge for ${part.name} lyrics`)"
            >
              <span class="slider-label lyric-part" :style="{ color: part.color }">{{
                part.name
              }}</span>
              <span class="slider-val">{{
                lyricOffsetLabel(project.view.sheetLyricOffsets?.[part.id] ?? 0)
              }}</span>
              <input
                type="range"
                class="slider"
                :min="SHEET_LYRIC_LINE_OFFSET_MIN"
                :max="SHEET_LYRIC_LINE_OFFSET_MAX"
                step="0.5"
                :value="project.view.sheetLyricOffsets?.[part.id] ?? 0"
                @input="onLyricOffset(part.id, $event)"
              />
            </label>
            <button
              v-if="hasLyricOffsets"
              type="button"
              class="reset-link"
              @click="store.resetSheetLyricOffsets()"
            >
              Reset lyric positions
            </button>
          </template>
          <label
            class="toggle-row"
            :class="{ on: project.view.sheetShowEngravedHeader !== false }"
          >
            <span class="toggle-title">{{ isPage ? 'Title on page 1' : 'Title block' }}</span>
            <input
              type="checkbox"
              class="setting-switch"
              role="switch"
              :checked="project.view.sheetShowEngravedHeader !== false"
              @change="toggleChecked(store.setSheetShowEngravedHeader, $event)"
            />
          </label>
          <label
            class="toggle-row"
            :class="{ on: project.view.sheetShowEngravedFooter !== false }"
          >
            <span class="toggle-title">Footer note</span>
            <input
              type="checkbox"
              class="setting-switch"
              role="switch"
              :checked="project.view.sheetShowEngravedFooter !== false"
              @change="toggleChecked(store.setSheetShowEngravedFooter, $event)"
            />
          </label>
        </div>
      </details>

      <details
        v-if="isPage"
        class="group"
        :open="open.page"
        @toggle="onGroupToggle('page', $event)"
      >
        <summary class="group-title">Page size</summary>
        <div class="group-body">
          <div class="preset-row">
            <button
              type="button"
              class="preset"
              :class="{ on: isLetterPage(pageWIn, pageHIn) }"
              @click="store.setSheetPagePreset('letter')"
            >
              Letter 8.5×11
            </button>
            <button
              type="button"
              class="preset"
              :class="{ on: isA4Page(pageWIn, pageHIn) }"
              @click="store.setSheetPagePreset('a4')"
            >
              A4
            </button>
          </div>
          <p class="page-hint">{{ pagePxLabel }}</p>
          <label class="slider-row">
            <span class="slider-label">Width</span>
            <span class="slider-val">{{ inches(pageWIn) }}</span>
            <input
              type="range"
              class="slider"
              :min="SHEET_PAGE_WIDTH_IN_MIN"
              :max="SHEET_PAGE_WIDTH_IN_MAX"
              step="0.05"
              :value="pageWIn"
              @input="numInput('sheetPageWidthIn', $event)"
            />
          </label>
          <label class="slider-row">
            <span class="slider-label">Height</span>
            <span class="slider-val">{{ inches(pageHIn) }}</span>
            <input
              type="range"
              class="slider"
              :min="SHEET_PAGE_HEIGHT_IN_MIN"
              :max="SHEET_PAGE_HEIGHT_IN_MAX"
              step="0.05"
              :value="pageHIn"
              @input="numInput('sheetPageHeightIn', $event)"
            />
          </label>
        </div>
      </details>

      <details
        class="group"
        :open="open.advanced"
        @toggle="onGroupToggle('advanced', $event)"
      >
        <summary class="group-title">Advanced</summary>
        <div class="group-body">
          <label
            v-if="isDynamic"
            class="slider-row"
            :title="tagRollTip('Extra room per rhythmic column')"
          >
            <span class="slider-label">Note spacing</span>
            <span class="slider-val">{{ pct(project.view.sheetNoteSpacing ?? 1) }}</span>
            <input
              type="range"
              class="slider"
              :min="SHEET_MEASURE_SCALE_MIN"
              :max="SHEET_MEASURE_SCALE_MAX"
              step="0.05"
              :value="project.view.sheetNoteSpacing ?? 1"
              @input="numInput('sheetNoteSpacing', $event)"
            />
          </label>
          <label class="slider-row">
            <span class="slider-label">Min bar width</span>
            <span class="slider-val">{{ pct(project.view.sheetMinBarWidth ?? 1) }}</span>
            <input
              type="range"
              class="slider"
              :min="SHEET_MIN_BAR_MIN"
              :max="SHEET_MIN_BAR_MAX"
              step="0.05"
              :value="project.view.sheetMinBarWidth ?? 1"
              @input="numInput('sheetMinBarWidth', $event)"
            />
          </label>
          <label class="slider-row">
            <span class="slider-label">Clef area</span>
            <span class="slider-val">{{ pct(project.view.sheetClefGutter ?? 1) }}</span>
            <input
              type="range"
              class="slider"
              :min="SHEET_CLEF_GUTTER_MIN"
              :max="SHEET_CLEF_GUTTER_MAX"
              step="0.05"
              :value="project.view.sheetClefGutter ?? 1"
              @input="numInput('sheetClefGutter', $event)"
            />
          </label>
          <label class="slider-row">
            <span class="slider-label">Expression headroom</span>
            <span class="slider-val">{{ pct(project.view.sheetTopMargin ?? 1) }}</span>
            <input
              type="range"
              class="slider"
              :min="SHEET_TOP_MARGIN_MIN"
              :max="SHEET_TOP_MARGIN_MAX"
              step="0.05"
              :value="project.view.sheetTopMargin ?? 1"
              @input="numInput('sheetTopMargin', $event)"
            />
          </label>
          <label class="slider-row">
            <span class="slider-label">Below staff</span>
            <span class="slider-val">{{ pct(project.view.sheetBottomMargin ?? 1) }}</span>
            <input
              type="range"
              class="slider"
              :min="SHEET_BOTTOM_MARGIN_MIN"
              :max="SHEET_BOTTOM_MARGIN_MAX"
              step="0.05"
              :value="project.view.sheetBottomMargin ?? 1"
              @input="numInput('sheetBottomMargin', $event)"
            />
          </label>
          <label class="inline-row">
            <span>Music font</span>
            <select
              class="sel"
              :value="project.view.sheetMusicFont ?? 'bravura'"
              @change="onMusicFont"
            >
              <option v-for="f in SHEET_MUSIC_FONT_CHOICES" :key="f.id" :value="f.id">
                {{ f.label }}
              </option>
            </select>
          </label>
          <label class="inline-row">
            <span>Text font</span>
            <select
              class="sel"
              :value="project.view.sheetTextFont ?? 'academico'"
              @change="onTextFont"
            >
              <option v-for="f in SHEET_TEXT_FONT_CHOICES" :key="f.id" :value="f.id">
                {{ f.label }}
              </option>
            </select>
          </label>
          <label class="slider-row">
            <span class="slider-label">Staff line weight</span>
            <span class="slider-val">{{ pct(project.view.sheetStaffLineWeight ?? 1) }}</span>
            <input
              type="range"
              class="slider"
              :min="SHEET_STAFF_LINE_MIN"
              :max="SHEET_STAFF_LINE_MAX"
              step="0.05"
              :value="project.view.sheetStaffLineWeight ?? 1"
              @input="numInput('sheetStaffLineWeight', $event)"
            />
          </label>
          <label class="toggle-row" :class="{ on: project.view.sheetPartNames === true }">
            <span class="toggle-title">Part names</span>
            <input
              type="checkbox"
              class="setting-switch"
              role="switch"
              :checked="project.view.sheetPartNames === true"
              @change="toggleChecked(store.setSheetPartNames, $event)"
            />
          </label>
          <label class="toggle-row" :class="{ on: project.view.sheetNoteColors !== false }">
            <span class="toggle-title">Note role colors</span>
            <input
              type="checkbox"
              class="setting-switch"
              role="switch"
              :checked="project.view.sheetNoteColors !== false"
              @change="toggleChecked(store.setSheetNoteColors, $event)"
            />
          </label>
          <label class="toggle-row" :class="{ on: project.view.sheetPlaybackHighlight !== false }">
            <span class="toggle-title">Playback highlight</span>
            <input
              type="checkbox"
              class="setting-switch"
              role="switch"
              :checked="project.view.sheetPlaybackHighlight !== false"
              @change="toggleChecked(store.setSheetPlaybackHighlight, $event)"
            />
          </label>
        </div>
      </details>
    </div>

    <footer class="foot">
      <p class="foot-hint">
        Defaults are saved separately for Continuous and Page. Your custom default overlays the system
        default.
      </p>
      <div class="foot-actions">
        <button
          type="button"
          class="btn btn-ghost"
          :title="tagRollTip(`Save current Format as my default for ${layoutLabel}`)"
          @click="onSaveDefault"
        >
          Save as my default
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          :title="
            tagRollTip(
              hasCustomDefault
                ? `Reset to my ${layoutLabel} default`
                : `Reset to system ${layoutLabel} defaults`,
            )
          "
          @click="store.resetSheetFormat()"
        >
          {{ hasCustomDefault ? 'Reset to my default' : 'Reset to defaults' }}
        </button>
      </div>
      <button
        v-if="hasCustomDefault"
        type="button"
        class="reset-link"
        :title="tagRollTip(`Remove saved ${layoutLabel} default (system defaults remain)`)"
        @click="onClearDefault"
      >
        Clear saved {{ layoutLabel }} default
      </button>
    </footer>
  </section>
</template>

<style scoped>
.format-panel {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-height: 0;
  height: 100%;
  padding: 0.35rem 0.45rem 0.55rem;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}
.title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 750;
}
.hint {
  margin: 0.2rem 0 0;
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--muted);
}
.close {
  flex: 0 0 auto;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg);
  border-radius: 6px;
  width: 1.75rem;
  height: 1.75rem;
  cursor: pointer;
}
.scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding-right: 0.15rem;
}
.group {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg) 92%, var(--fg) 4%);
}
.group-title {
  cursor: pointer;
  list-style: none;
  padding: 0.45rem 0.55rem;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--muted);
  user-select: none;
}
.group-title::-webkit-details-marker {
  display: none;
}
.group-title::before {
  content: '▸';
  display: inline-block;
  width: 0.9em;
  color: var(--fg);
  transition: transform 0.12s ease;
}
.group[open] > .group-title::before {
  transform: rotate(90deg);
}
.group-body {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0 0.55rem 0.55rem;
}
.page-hint {
  margin: 0;
  font-size: 0.72rem;
  color: var(--muted);
  line-height: 1.3;
}
.segment {
  display: flex;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.seg-btn {
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--fg);
  padding: 0.35rem 0.5rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
.seg-btn + .seg-btn {
  border-left: 1px solid var(--border);
}
.seg-btn.on {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
}
.slider-row {
  display: grid;
  grid-template-columns: 6.5rem 3.2rem 1fr;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
}
.slider-label {
  color: var(--fg);
}
.slider-label.lyric-part {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.slider-val {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  font-size: 0.72rem;
}
.slider {
  width: 100%;
  accent-color: var(--accent);
}
.reset-link {
  align-self: flex-start;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.15rem 0;
  cursor: pointer;
  text-decoration: underline;
}
.num-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.35rem;
}
.num-field {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: 0.68rem;
  color: var(--muted);
  font-weight: 700;
}
.num-field input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--fg);
  padding: 0.25rem 0.3rem;
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}
.num-field input:disabled {
  opacity: 0.55;
}
.inline-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.78rem;
}
.sel {
  min-width: 8rem;
  max-width: 60%;
  font-size: 0.78rem;
  padding: 0.25rem 0.35rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--fg);
}
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.2rem 0;
  font-size: 0.8rem;
}
.toggle-title {
  font-weight: 600;
}
.setting-switch {
  width: 2.2rem;
  height: 1.2rem;
  accent-color: var(--accent);
}
.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.preset {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg);
  border-radius: 7px;
  padding: 0.3rem 0.55rem;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}
.preset.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}
.btn {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--fg);
  border-radius: 7px;
  padding: 0.35rem 0.6rem;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  align-self: flex-start;
}
.btn-ghost {
  background: transparent;
}
.foot {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  border-top: 1px solid var(--border);
  padding-top: 0.4rem;
}
.foot-hint {
  margin: 0;
  font-size: 0.68rem;
  line-height: 1.35;
  color: var(--muted);
}
.foot-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.foot-actions .btn {
  flex: 1 1 auto;
}
</style>
