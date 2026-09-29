<script setup lang="ts">
/**
 * View marks — toggle piano-roll chrome so melody / roles stay readable.
 */
import { computed } from 'vue'
import {
  roleDisplayFromToggles,
  roleDisplayShowsMelody,
  roleDisplayShowsRoles,
} from '../../lib/tagRoll/roleDisplay'
import { tagRollTip } from '../../lib/tagRoll/shortcuts'
import type { TagRollRoleDisplay } from '../../lib/tagRoll/types'
import { useTagRollStore } from '../../stores/tagRoll'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useTagRollStore()
const project = computed(() => store.current)
const roleDisplay = computed(
  () => (project.value?.view.roleDisplay ?? 'off') as TagRollRoleDisplay,
)
const showMelody = computed(() => roleDisplayShowsMelody(roleDisplay.value))
const showRoles = computed(() => roleDisplayShowsRoles(roleDisplay.value))
const scaleHighlight = computed(() => project.value?.view.scaleHighlight !== false)
const showNoteNames = computed(() => project.value?.view.showNoteNames !== false)
const showNoteLyrics = computed(() => project.value?.view.showNoteLyrics !== false)

function setMelody(on: boolean): void {
  store.setRoleDisplay(roleDisplayFromToggles(on, showRoles.value))
}

function setRoles(on: boolean): void {
  store.setRoleDisplay(roleDisplayFromToggles(showMelody.value, on))
}

function setScale(on: boolean): void {
  store.setScaleHighlight(on)
}

function setNoteNames(on: boolean): void {
  store.setShowNoteNames(on)
}

function setNoteLyrics(on: boolean): void {
  store.setShowNoteLyrics(on)
}

function clearMarks(): void {
  store.setRoleDisplay('off')
  store.setShowNoteNames(false)
  store.setShowNoteLyrics(false)
}

function rolesOnly(): void {
  store.setRoleDisplay('roles')
}

function melodyOnly(): void {
  store.setRoleDisplay('melody')
}
</script>

<template>
  <div v-if="open && project" class="tr-filters" role="dialog" aria-label="View marks">
    <header class="head">
      <h2 class="title">View marks</h2>
      <button
        type="button"
        class="btn ghost"
        :aria-label="tagRollTip('Close', 'Esc')"
        :title="tagRollTip('Close', 'Esc')"
        @click="emit('close')"
      >
        ✕
      </button>
    </header>

    <p class="hint">
      Turn chrome on only when you need it. Melody, roles, note names, and lyrics are independent so
      the roll stays readable.
    </p>

    <fieldset class="group">
      <legend>Note chrome</legend>
      <label class="row" :title="tagRollTip('Red left stripe on the Melody part')">
        <input
          type="checkbox"
          :checked="showMelody"
          @change="setMelody(($event.target as HTMLInputElement).checked)"
        />
        <span class="swatch mel" aria-hidden="true" />
        <span class="lbl">
          <strong>Melody</strong>
          <span class="sub">Red stripe on the Melody part</span>
        </span>
      </label>
      <label class="row" :title="tagRollTip('Green / yellow stripes for Strong and Passing')">
        <input
          type="checkbox"
          :checked="showRoles"
          @change="setRoles(($event.target as HTMLInputElement).checked)"
        />
        <span class="swatch-pair" aria-hidden="true">
          <span class="swatch pmn" />
          <span class="swatch smn" />
        </span>
        <span class="lbl">
          <strong>Strong / Passing</strong>
          <span class="sub">Role stripes on labeled notes</span>
        </span>
      </label>
      <label class="row" :title="tagRollTip('Pitch name inside each note (e.g. Bb)')">
        <input
          type="checkbox"
          :checked="showNoteNames"
          @change="setNoteNames(($event.target as HTMLInputElement).checked)"
        />
        <span class="lbl">
          <strong>Note names</strong>
          <span class="sub">Bold pitch spelling in each box</span>
        </span>
      </label>
      <label class="row" :title="tagRollTip('Lyric syllable after the pitch name')">
        <input
          type="checkbox"
          :checked="showNoteLyrics"
          @change="setNoteLyrics(($event.target as HTMLInputElement).checked)"
        />
        <span class="lbl">
          <strong>Lyrics on notes</strong>
          <span class="sub">Italic lyric after the pitch name</span>
        </span>
      </label>
    </fieldset>

    <fieldset class="group">
      <legend>Grid</legend>
      <label class="row" :title="tagRollTip('Tint pitch rows that match the current key')">
        <input
          type="checkbox"
          :checked="scaleHighlight"
          @change="setScale(($event.target as HTMLInputElement).checked)"
        />
        <span class="lbl">
          <strong>Scale highlight</strong>
          <span class="sub">Tint in-key pitch rows</span>
        </span>
      </label>
    </fieldset>

    <div class="presets" role="group" aria-label="Quick presets">
      <button type="button" class="btn sm" :title="tagRollTip('Hide melody, roles, note names, and lyrics')" @click="clearMarks">
        Clear
      </button>
      <button
        type="button"
        class="btn sm"
        :class="{ on: roleDisplay === 'roles' }"
        :title="tagRollTip('Strong / Passing only')"
        @click="rolesOnly"
      >
        Roles only
      </button>
      <button
        type="button"
        class="btn sm"
        :class="{ on: roleDisplay === 'melody' }"
        :title="tagRollTip('Melody stripe only')"
        @click="melodyOnly"
      >
        Melody only
      </button>
    </div>
  </div>
</template>

<style scoped>
.tr-filters {
  position: fixed;
  top: 4.5rem;
  right: 0.75rem;
  z-index: 45;
  width: min(22rem, calc(100vw - 1.5rem));
  display: grid;
  gap: 0.65rem;
  padding: 0.75rem 0.85rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: -8px 0 28px color-mix(in srgb, #000 14%, transparent);
  color: var(--text);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.title {
  margin: 0;
  font-size: 1rem;
  font-weight: 750;
}
.hint {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.35;
  color: var(--muted);
}
.group {
  margin: 0;
  padding: 0.45rem 0.55rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  display: grid;
  gap: 0.35rem;
}
.group legend {
  padding: 0 0.25rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.row {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  padding: 0.25rem 0.1rem;
  cursor: pointer;
}
.row input {
  margin-top: 0.2rem;
  flex: 0 0 auto;
}
.lbl {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}
.lbl strong {
  font-size: 0.88rem;
  font-weight: 700;
}
.sub {
  font-size: 0.72rem;
  color: var(--muted);
  line-height: 1.3;
}
.swatch {
  width: 0.55rem;
  height: 1.35rem;
  margin-top: 0.1rem;
  border-radius: 2px;
  flex: 0 0 auto;
}
.swatch.mel {
  background: rgba(140, 16, 28, 1);
}
.swatch.pmn {
  background: rgba(28, 130, 78, 1);
}
.swatch.smn {
  background: rgba(230, 175, 20, 1);
}
.swatch-pair {
  display: inline-flex;
  gap: 2px;
  margin-top: 0.1rem;
  flex: 0 0 auto;
}
.swatch-pair .swatch {
  margin-top: 0;
  height: 1.35rem;
}
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.btn {
  min-height: 34px;
  padding: 0.25rem 0.55rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.btn.sm {
  min-height: 32px;
  font-size: 0.82rem;
}
.btn.on {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
.btn.ghost {
  border: none;
  background: transparent;
  color: var(--muted);
  min-height: 28px;
  padding: 0.1rem 0.35rem;
}
</style>
