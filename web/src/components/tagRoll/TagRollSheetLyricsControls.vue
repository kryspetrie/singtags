<script setup lang="ts">
/**
 * Per-part lyric show + vertical nudge (Format → Lyrics).
 */
import { computed } from 'vue'
import type { TagRollProject } from '../../lib/tagRoll/types'
import {
  SHEET_LYRIC_LINE_OFFSET_MAX,
  SHEET_LYRIC_LINE_OFFSET_MIN,
  SHEET_LYRIC_SIZE_MAX,
  SHEET_LYRIC_SIZE_MIN,
} from '../../lib/tagRoll/sheetFormat'
import { isSheetLyricPartVisible } from '../../lib/tagRoll/sheetScore/sheetLyricLanes'
import { tagRollTip } from '../../lib/tagRoll/shortcuts'
import { useTagRollStore } from '../../stores/tagRoll'

const props = defineProps<{ project: TagRollProject }>()
const store = useTagRollStore()

const show = computed(() => props.project.view.sheetShowLyrics !== false)
const straight = computed(() => props.project.view.sheetStraightLyrics !== false)
const dirty = computed(
  () =>
    Object.values(props.project.view.sheetLyricOffsets ?? {}).some((v) => v !== 0) ||
    Object.values(props.project.view.sheetLyricPartVisible ?? {}).some((v) => v === false),
)

function offsetLabel(v: number): string {
  if (v === 0) return '0'
  return v > 0 ? `+${v}` : `${v}`
}

function onOffset(partId: string, e: Event): void {
  store.setSheetLyricOffset(partId, Number((e.target as HTMLInputElement).value))
}

function onVisible(partId: string, e: Event): void {
  const on = (e.target as HTMLInputElement).checked
  const next = { ...(props.project.view.sheetLyricPartVisible ?? {}) }
  if (on) delete next[partId]
  else next[partId] = false
  store.patchView({ sheetLyricPartVisible: next })
}
</script>

<template>
  <label class="toggle-row" :class="{ on: show }">
    <span class="toggle-title">Show lyrics</span>
    <input
      type="checkbox"
      class="setting-switch"
      role="switch"
      :checked="show"
      @change="store.setSheetShowLyrics(($event.target as HTMLInputElement).checked)"
    />
  </label>
  <template v-if="show">
    <label
      class="toggle-row"
      :class="{ on: straight }"
      :title="tagRollTip('Tenor/bari above staff, lead/bass below — one straight line each')"
    >
      <span class="toggle-title">Straight lyric lines</span>
      <input
        type="checkbox"
        class="setting-switch"
        role="switch"
        :checked="straight"
        @change="
          store.patchView({
            sheetStraightLyrics: ($event.target as HTMLInputElement).checked,
          })
        "
      />
    </label>
    <label class="slider-row">
      <span class="slider-label">Lyric size</span>
      <span class="slider-val">{{ project.view.sheetLyricSize ?? 11 }}px</span>
      <input
        type="range"
        class="slider"
        :min="SHEET_LYRIC_SIZE_MIN"
        :max="SHEET_LYRIC_SIZE_MAX"
        step="1"
        :value="project.view.sheetLyricSize ?? 11"
        @input="store.setSheetLyricSize(Number(($event.target as HTMLInputElement).value))"
      />
    </label>
    <p class="hint">
      {{
        straight
          ? 'Show and nudge each part’s straight lyric lane (chords lift with above-staff shift).'
          : 'Show and move each part’s lyric line below its staff.'
      }}
    </p>
    <div v-for="part in project.parts" :key="part.id" class="lyric-part">
      <label
        class="lyric-part-on"
        :title="tagRollTip(`Show ${part.name} lyrics`)"
      >
        <input
          type="checkbox"
          :checked="isSheetLyricPartVisible(project.view, part.id)"
          @change="onVisible(part.id, $event)"
        />
        <span class="lyric-part-name" :style="{ color: part.color }">{{
          part.name
        }}</span>
      </label>
      <span class="slider-val">{{
        offsetLabel(project.view.sheetLyricOffsets?.[part.id] ?? 0)
      }}</span>
      <input
        type="range"
        class="slider"
        :min="SHEET_LYRIC_LINE_OFFSET_MIN"
        :max="SHEET_LYRIC_LINE_OFFSET_MAX"
        step="0.5"
        :disabled="!isSheetLyricPartVisible(project.view, part.id)"
        :value="project.view.sheetLyricOffsets?.[part.id] ?? 0"
        :title="tagRollTip(`Vertical nudge for ${part.name} lyrics`)"
        @input="onOffset(part.id, $event)"
      />
    </div>
    <button
      v-if="dirty"
      type="button"
      class="reset-link"
      @click="store.resetSheetLyricOffsets()"
    >
      Reset lyric parts
    </button>
  </template>
</template>

<style scoped>
.hint {
  margin: 0.25rem 0 0.15rem;
  font-size: 0.72rem;
  color: var(--muted);
  line-height: 1.35;
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
.lyric-part {
  display: grid;
  grid-template-columns: minmax(4.5rem, auto) 2.2rem 1fr;
  align-items: center;
  gap: 0.35rem 0.5rem;
  margin: 0.35rem 0;
}
.lyric-part-on {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  cursor: pointer;
}
.lyric-part-on input {
  margin: 0;
  flex: 0 0 auto;
}
.lyric-part-name {
  font-size: 0.78rem;
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
</style>
