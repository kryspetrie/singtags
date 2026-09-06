<script setup lang="ts">
/**
 * Chromatic pitch pipe page: concert-A tuning, note range/layout prefs, hold-to-play keys.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  PITCH_PIPE_A_TUNINGS,
  PITCH_PIPE_GRID_COLS,
  PITCH_PIPE_GRID_SCALE_MAX,
  PITCH_PIPE_GRID_SCALE_MIN,
  PITCH_PIPE_LAYOUT_OPTIONS,
  PITCH_PIPE_RANGE_OPTIONS,
  pitchPipeAriaLabel,
  pitchPipeDisplay,
  pitchPipeFullKeyboardNotes,
  pitchPipeNotes,
  pitchPipePianoSlots,
  PitchPlayer,
  type PitchPipeAHz,
  type PitchPipeLayout,
  type PitchPipeRange,
} from '../audio/pitchPlayer'
import {
  getActivePitchPipeVoice,
  PITCH_PIPE_SOUND_OPTIONS,
  PITCH_PIPE_VOICE_CHANGE_EVENT,
  type PitchPipeSoundId,
} from '../audio/pitchPipeVoice'
import { usePreferencesStore } from '../stores/preferences'
import { setSessionBusy } from '../lib/sessionActivity'

const prefs = usePreferencesStore()
const player = new PitchPlayer(getActivePitchPipeVoice())
/** Concert A preset (`null` = custom / “—”). */
const aHz = computed(() => prefs.pitchPipeAHz)
/** Absolute cents vs A440 (slider + playback). */
const detune = computed({
  get: () => prefs.pitchPipeDetuneCents,
  set: (v: number) => prefs.setPitchPipeDetuneCents(v, { clearConcertA: true }),
})
const current = ref<string | null>(null)
const keysRef = ref<HTMLElement | null>(null)
const pianoScrollRef = ref<HTMLElement | null>(null)

const concertASelectValue = computed(() => (aHz.value == null ? 'custom' : String(aHz.value)))

const pipeSound = computed({
  get: (): PitchPipeSoundId => prefs.pitchPipeSound,
  set: (v: PitchPipeSoundId) => prefs.setPitchPipeSound(v),
})

const detuneLabel = computed(() => {
  const n = detune.value
  const sign = n > 0 ? '+' : ''
  return `${sign}${n} cents`
})

function onConcertAChange(e: Event): void {
  const raw = (e.target as HTMLSelectElement).value
  const hz = Number(raw)
  if (!PITCH_PIPE_A_TUNINGS.some((t) => t.hz === hz)) return
  prefs.setPitchPipeConcertA(hz as PitchPipeAHz)
}

function resetDetune(): void {
  prefs.setPitchPipeConcertA(440)
}

const pipeRange = computed({
  get: (): PitchPipeRange => prefs.pitchPipeRange,
  set: (v: PitchPipeRange) => prefs.setPitchPipeRange(v),
})

const pipeLayout = computed({
  get: (): PitchPipeLayout => prefs.pitchPipeLayout,
  set: (v: PitchPipeLayout) => prefs.setPitchPipeLayout(v),
})

const showOctave = computed({
  get: () => prefs.pitchPipeShowOctave,
  set: (v: boolean) => prefs.setPitchPipeShowOctave(v),
})

const gridScale = computed(() => prefs.pitchPipeGridScale)

const showFullKeyboard = computed({
  get: () => prefs.pitchPipeShowFullKeyboard,
  set: (v: boolean) => prefs.setPitchPipeShowFullKeyboard(v),
})

/** Octave digit for labels when the setting is on; empty when off. */
function octaveLabel(octave: string): string {
  return showOctave.value ? octave : ''
}

/** Notes in the selected Settings range (always the practice window). */
const rangeNotes = computed(() => pitchPipeNotes(pipeRange.value))
const rangeNoteSet = computed(() => new Set(rangeNotes.value))

/**
 * Keys shown on screen: selected range, or the full 66-key piano when that toggle is on.
 */
const noteList = computed(() =>
  pipeLayout.value === 'piano' && showFullKeyboard.value
    ? pitchPipeFullKeyboardNotes()
    : rangeNotes.value,
)

/** High → low for on-screen order (highest pitches at the top). */
const visualNotes = computed(() => [...noteList.value].reverse())

const noteRows = computed(() =>
  visualNotes.value.map((note) => {
    const display = pitchPipeDisplay(note)
    return {
      note,
      display,
      aria: pitchPipeAriaLabel(note),
      inRange: rangeNoteSet.value.has(note),
    }
  }),
)

const byNote = computed(() => {
  const map = new Map<string, (typeof noteRows.value)[number]>()
  for (const row of noteRows.value) map.set(row.note, row)
  return map
})

const pianoSlots = computed(() => pitchPipePianoSlots(noteList.value))

/** White keys top → bottom = high → low. */
const visualWhites = computed(() => [...pianoSlots.value.whites].reverse())

const whiteKeyPct = computed(() => {
  const n = visualWhites.value.length
  return n > 0 ? 100 / n : 100
})

/** Scroll the full keyboard so the selected note range sits near the middle of the viewport. */
function scrollPianoToRange(): void {
  void nextTick(() => {
    const scroller = pianoScrollRef.value
    if (!scroller || !showFullKeyboard.value || pipeLayout.value !== 'piano') return
    const mid = rangeNotes.value[Math.floor(rangeNotes.value.length / 2)]
    if (!mid) return
    const target = scroller.querySelector<HTMLElement>(
      `button.note[data-note="${CSS.escape(mid)}"]`,
    )
    target?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
  })
}

onMounted(() => {
  scrollPianoToRange()
})

onUnmounted(() => {
  window.removeEventListener(PITCH_PIPE_VOICE_CHANGE_EVENT, syncPitchVoice)
  setSessionBusy('pitch-pipe', false)
  player.dispose()
})

function syncPitchVoice(): void {
  player.setVoice(getActivePitchPipeVoice())
}

if (typeof window !== 'undefined') {
  window.addEventListener(PITCH_PIPE_VOICE_CHANGE_EVENT, syncPitchVoice)
}

watch(detune, (cents) => {
  if (current.value) void player.start(current.value, cents)
})

watch(pipeRange, () => {
  if (current.value && !noteList.value.includes(current.value)) {
    up()
  }
  scrollPianoToRange()
})

watch([showFullKeyboard, pipeLayout], () => {
  scrollPianoToRange()
})

async function down(note: string): Promise<void> {
  current.value = note
  setSessionBusy('pitch-pipe', true)
  await player.start(note, detune.value)
}

function up(): void {
  current.value = null
  player.stop(true)
  setSessionBusy('pitch-pipe', false)
}

function onNoteKey(e: KeyboardEvent, note: string): void {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    if (e.type === 'keydown' && !e.repeat) void down(note)
    if (e.type === 'keyup') up()
  }
}

function focusNeighbor(e: KeyboardEvent, note: string): void {
  const order = visualNotes.value
  const cols = pipeLayout.value === 'grid' ? PITCH_PIPE_GRID_COLS : 1
  const index = order.indexOf(note)
  if (index < 0) return
  const max = order.length - 1
  let next = index
  // Visual order is high→low top→bottom / LTR in grid rows.
  if (e.key === 'ArrowRight') next = Math.min(max, index + 1)
  else if (e.key === 'ArrowLeft') next = Math.max(0, index - 1)
  else if (e.key === 'ArrowDown') next = Math.min(max, index + cols)
  else if (e.key === 'ArrowUp') next = Math.max(0, index - cols)
  else return
  e.preventDefault()
  const target = order[next]
  if (!target) return
  const root = pianoScrollRef.value ?? keysRef.value
  const btn = root?.querySelector<HTMLButtonElement>(
    `button.note[data-note="${CSS.escape(target)}"]`,
  )
  btn?.focus()
}

/** Black key sits on the boundary above the lower white (`after`) toward the higher white. */
function blackTopPct(after: string): number {
  const idx = visualWhites.value.indexOf(after)
  if (idx < 0) return 0
  return idx * whiteKeyPct.value
}
</script>

<template>
  <section class="pipe" aria-label="Pitch pipe">
    <details class="settings">
      <summary>Settings</summary>
      <div class="tuning" role="group" aria-label="Pitch pipe tuning">
        <label class="range-ref">
          <span class="lbl">Sound</span>
          <select v-model="pipeSound" aria-label="Pitch pipe sound">
            <option v-for="s in PITCH_PIPE_SOUND_OPTIONS" :key="s.value" :value="s.value">
              {{ s.label }}
            </option>
          </select>
        </label>

        <label class="range-ref">
          <span class="lbl">Layout</span>
          <select v-model="pipeLayout" aria-label="Pitch pipe layout">
            <option v-for="r in PITCH_PIPE_LAYOUT_OPTIONS" :key="r.value" :value="r.value">
              {{ r.label }}
            </option>
          </select>
        </label>

        <label class="range-ref">
          <span class="lbl">Note range</span>
          <select v-model="pipeRange" aria-label="Pitch pipe note range">
            <option v-for="r in PITCH_PIPE_RANGE_OPTIONS" :key="r.value" :value="r.value">
              {{ r.label }}
            </option>
          </select>
        </label>

        <label
          class="setting-row octave-toggle"
          :class="{ on: showOctave }"
          title="Include octave numbers on note labels (E4 vs E)"
        >
          <span class="setting-copy">
            <span class="setting-title">Show octave number</span>
          </span>
          <input
            v-model="showOctave"
            type="checkbox"
            class="setting-switch"
            role="switch"
            :aria-checked="showOctave"
            aria-label="Show octave number"
          />
        </label>

        <div
          v-if="pipeLayout === 'grid'"
          class="scale-controls"
          role="group"
          aria-label="Grid size"
        >
          <span class="lbl">Grid size</span>
          <button
            type="button"
            class="btn btn-ghost scale-btn"
            :disabled="gridScale <= PITCH_PIPE_GRID_SCALE_MIN"
            aria-label="Decrease grid size"
            @click="prefs.nudgePitchPipeGridScale(-5)"
          >
            −
          </button>
          <span class="scale-value" aria-live="polite">{{ gridScale }}%</span>
          <button
            type="button"
            class="btn btn-ghost scale-btn"
            :disabled="gridScale >= PITCH_PIPE_GRID_SCALE_MAX"
            aria-label="Increase grid size"
            @click="prefs.nudgePitchPipeGridScale(5)"
          >
            +
          </button>
        </div>

        <label
          v-if="pipeLayout === 'piano'"
          class="setting-row full-keyboard-toggle"
          :class="{ on: showFullKeyboard }"
          title="Show a scrollable 66-key piano (C2–F7), focused on your note range"
        >
          <span class="setting-copy">
            <span class="setting-title">Show full keyboard</span>
          </span>
          <input
            v-model="showFullKeyboard"
            type="checkbox"
            class="setting-switch"
            role="switch"
            :aria-checked="showFullKeyboard"
            aria-label="Show full keyboard"
          />
        </label>

        <label class="a-ref">
          <span class="lbl">Concert A</span>
          <select
            :value="concertASelectValue"
            aria-label="Concert A frequency"
            @change="onConcertAChange"
          >
            <option v-if="aHz == null" value="custom" disabled>—</option>
            <option v-for="t in PITCH_PIPE_A_TUNINGS" :key="t.hz" :value="String(t.hz)">
              {{ t.label }}
            </option>
          </select>
        </label>

        <label class="detune">
          <span class="lbl">Fine detune <strong>{{ detuneLabel }}</strong></span>
          <input
            v-model.number="detune"
            type="range"
            min="-50"
            max="50"
            step="1"
            aria-valuemin="-50"
            aria-valuemax="50"
            :aria-valuenow="detune"
            aria-label="Fine detune in cents"
          />
        </label>

        <label
          class="setting-row global-detune"
          :class="{ on: prefs.applyDetuneGlobally }"
          title="Apply this concert A / fine detune to tag Pitch, Mix, and My Library tracks"
        >
          <span class="setting-copy">
            <span class="setting-title">Apply tuning globally</span>
          </span>
          <input
            type="checkbox"
            class="setting-switch"
            role="switch"
            :checked="prefs.applyDetuneGlobally"
            :aria-checked="prefs.applyDetuneGlobally"
            aria-label="Apply tuning globally"
            @change="prefs.setApplyDetuneGlobally(($event.target as HTMLInputElement).checked)"
          />
        </label>

        <button
          type="button"
          class="btn reset"
          :disabled="aHz === 440 && detune === 0"
          title="Reset to A = 440 Hz with no fine detune"
          @click="resetDetune"
        >
          Reset
        </button>
      </div>
    </details>

    <div class="stage">
      <div
        v-if="pipeLayout === 'piano'"
        ref="pianoScrollRef"
        class="piano-shell"
        :class="{ 'piano-shell-scroll': showFullKeyboard }"
      >
        <div
          ref="keysRef"
          class="piano"
          role="group"
          :aria-label="`Pitch pipe piano (${pipeRange})`"
          :style="{ '--white-count': visualWhites.length }"
        >
          <div class="piano-whites">
            <button
              v-for="note in visualWhites"
              :key="note"
              type="button"
              class="note natural"
              :data-note="note"
              :class="{
                active: current === note,
                'out-of-range': showFullKeyboard && !byNote.get(note)?.inRange,
              }"
              :aria-pressed="current === note"
              :aria-label="byNote.get(note)?.aria"
              @pointerdown.prevent="down(note)"
              @pointerup.prevent="up"
              @pointerleave.prevent="up"
              @pointercancel.prevent="up"
              @keydown="onNoteKey($event, note); focusNeighbor($event, note)"
              @keyup="onNoteKey($event, note)"
            >
              <span class="note-single"
                >{{ byNote.get(note)?.display.sharp }}{{ octaveLabel(byNote.get(note)?.display.octave ?? '') }}</span
              >
            </button>
          </div>
          <div class="piano-blacks">
            <button
              v-for="b in pianoSlots.blacks"
              :key="b.note"
              type="button"
              class="note black"
              :data-note="b.note"
              :class="{
                active: current === b.note,
                'out-of-range': showFullKeyboard && !byNote.get(b.note)?.inRange,
              }"
              :style="{ top: `${blackTopPct(b.after)}%` }"
              :aria-pressed="current === b.note"
              :aria-label="byNote.get(b.note)?.aria"
              @pointerdown.prevent="down(b.note)"
              @pointerup.prevent="up"
              @pointerleave.prevent="up"
              @pointercancel.prevent="up"
              @keydown="onNoteKey($event, b.note); focusNeighbor($event, b.note)"
              @keyup="onNoteKey($event, b.note)"
            >
              <span class="note-dual">
                <span class="note-sharp"
                  >{{ byNote.get(b.note)?.display.sharp }}{{ octaveLabel(byNote.get(b.note)?.display.octave ?? '') }}</span
                >
                <span class="note-sep" aria-hidden="true">/</span>
                <span class="note-flat"
                  >{{ byNote.get(b.note)?.display.flat }}{{ octaveLabel(byNote.get(b.note)?.display.octave ?? '') }}</span
                >
              </span>
            </button>
          </div>
        </div>
      </div>

      <div
        v-else
        ref="keysRef"
        class="keys"
        :class="pipeLayout === 'list' ? 'keys-list' : 'keys-grid'"
        :style="pipeLayout === 'grid' ? { '--grid-scale': gridScale / 100 } : undefined"
        role="group"
        :aria-label="`Pitch pipe notes (${pipeRange})`"
      >
        <button
          v-for="entry in noteRows"
          :key="entry.note"
          type="button"
          class="note"
          :data-note="entry.note"
          :class="{
            active: current === entry.note,
            black: entry.display.isBlack,
            natural: !entry.display.isBlack,
          }"
          :aria-pressed="current === entry.note"
          :aria-label="entry.aria"
          @pointerdown.prevent="down(entry.note)"
          @pointerup.prevent="up"
          @pointerleave.prevent="up"
          @pointercancel.prevent="up"
          @keydown="onNoteKey($event, entry.note); focusNeighbor($event, entry.note)"
          @keyup="onNoteKey($event, entry.note)"
        >
          <span
            v-if="entry.display.isBlack && entry.display.sharp && entry.display.flat"
            class="note-dual"
          >
            <span class="note-sharp"
              >{{ entry.display.sharp }}{{ octaveLabel(entry.display.octave) }}</span
            >
            <span class="note-sep" aria-hidden="true">/</span>
            <span class="note-flat"
              >{{ entry.display.flat }}{{ octaveLabel(entry.display.octave) }}</span
            >
          </span>
          <span v-else class="note-single"
            >{{ entry.display.sharp }}{{ octaveLabel(entry.display.octave) }}</span
          >
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.pipe {
  padding: 1rem 1rem 5rem;
  max-width: 44rem;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}
.settings {
  margin: 0 0 1.25rem;
}
.settings > summary {
  cursor: pointer;
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--muted);
  margin-bottom: 0.35rem;
}
.tuning {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  align-items: flex-end;
  margin: 0.5rem 0 0;
}
.range-ref,
.a-ref,
.detune {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  color: var(--muted);
  font-size: 0.9rem;
  min-width: 0;
}
.range-ref,
.a-ref {
  flex: 0 1 11rem;
}
.detune {
  flex: 1 1 14rem;
}
.lbl {
  font-weight: 600;
  color: var(--text);
}
.lbl strong {
  font-weight: 700;
  color: var(--accent);
  margin-left: 0.25rem;
}
.range-ref select,
.a-ref select {
  font: inherit;
  min-height: 40px;
  padding: 0.35rem 0.55rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}
.detune input[type='range'] {
  width: 100%;
  accent-color: var(--accent);
}
.global-detune,
.octave-toggle {
  flex: 1 1 100%;
  margin: 0.25rem 0 0;
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  user-select: none;
}
.setting-row.on .setting-title {
  color: var(--accent-hover);
}
.setting-copy {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}
.setting-title {
  font-size: 0.92rem;
  font-weight: 650;
  color: var(--text);
}
.setting-switch {
  appearance: none;
  position: relative;
  flex: 0 0 auto;
  width: 2.6rem;
  height: 1.45rem;
  margin: 0;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--border) 55%, var(--surface));
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.setting-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: calc(1.45rem - 6px);
  height: calc(1.45rem - 6px);
  border-radius: 50%;
  background: var(--text);
  transition: transform 0.15s ease;
}
.setting-switch:checked {
  background: color-mix(in srgb, var(--accent) 70%, var(--surface));
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
}
.setting-switch:checked::after {
  transform: translateX(1.15rem);
  background: #fff;
}
.setting-switch:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.reset {
  flex-shrink: 0;
  min-height: 40px;
  padding: 0.35rem 0.85rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
}
.reset:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.stage {
  width: 100%;
  display: flex;
  justify-content: center;
}

.keys-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.55rem;
  width: 100%;
  max-width: 36rem;
}
.keys-list {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  width: 100%;
  max-width: 28rem;
}
.keys-list .note {
  min-height: 3.25rem;
  width: 100%;
  justify-content: flex-start;
  padding-inline: 1rem;
}
.keys-list .note-dual {
  justify-content: flex-start;
}

.note {
  border: 2px solid var(--border);
  background: var(--surface);
  border-radius: 12px;
  min-height: 5.25rem;
  padding: 0.65rem 0.35rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--text);
}
.note-single {
  font-size: clamp(1.35rem, 4vw, 1.75rem);
  line-height: 1.1;
}
.note-dual {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: 0.25rem 0.35rem;
  line-height: 1.1;
  width: 100%;
  font-size: clamp(1.2rem, 3.6vw, 1.55rem);
}
.note-sep {
  opacity: 0.55;
  font-weight: 600;
}
.note.natural {
  background: color-mix(in srgb, var(--surface) 88%, #fff);
  border-color: color-mix(in srgb, var(--border) 70%, #999);
}
.note.black {
  background: color-mix(in srgb, var(--text) 42%, var(--surface));
  color: color-mix(in srgb, var(--surface) 92%, #fff);
  border-color: color-mix(in srgb, var(--text) 55%, var(--border));
}
/* Grid: uniform keys — no black/white fill distinction. */
.keys-grid .note.natural,
.keys-grid .note.black {
  background: var(--surface);
  border-color: var(--border);
  color: var(--text);
}
.note.active {
  outline: 3px solid var(--accent);
  outline-offset: 1px;
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.piano {
  --white-count: 8;
  --white-h: calc(100% / var(--white-count));
  position: relative;
  width: 100%;
  max-width: 28rem;
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: visible;
  background: color-mix(in srgb, var(--border) 35%, var(--surface));
}
.piano-whites {
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  overflow: hidden;
}
.piano-whites .note {
  min-height: 3.5rem;
  height: 3.5rem;
  border-radius: 0;
  border-width: 0 0 1px;
  border-color: var(--border);
  justify-content: flex-start;
  padding-inline: 1rem;
}
.piano-whites .note:last-child {
  border-bottom: 0;
}
.piano-blacks {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.piano-blacks .note {
  pointer-events: auto;
  position: absolute;
  right: 0.45rem;
  /* At least half a white key; prefer ~60% for easier touch. */
  width: min(58%, 12rem);
  height: max(1.85rem, calc(3.5rem * 0.6));
  min-height: max(1.85rem, calc(3.5rem * 0.5));
  border-radius: 10px;
  z-index: 2;
  padding: 0.35rem 0.45rem;
  transform: translateY(-50%);
  box-shadow: 0 2px 6px color-mix(in srgb, #000 22%, transparent);
}
.piano-blacks .note-dual {
  font-size: clamp(1.05rem, 3.2vw, 1.25rem);
  gap: 0.2rem 0.3rem;
}

@media (min-width: 720px) {
  .keys-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    max-width: 44rem;
  }
  .keys-grid .note {
    min-height: 5.75rem;
  }
  .piano-whites .note {
    min-height: 3.75rem;
    height: 3.75rem;
  }
  .piano-blacks .note {
    height: max(2.1rem, calc(3.75rem * 0.6));
    min-height: max(2.1rem, calc(3.75rem * 0.5));
  }
}

.scale-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  flex: 1 1 100%;
}
.scale-controls .lbl { font-weight: 600; margin-right: 0.15rem; }
.scale-btn {
  min-width: 2.5rem;
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1;
}
.scale-value {
  min-width: 3.25rem;
  text-align: center;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}
.keys-grid { --grid-scale: 1; gap: calc(0.55rem * var(--grid-scale)); }
.keys-grid .note {
  min-height: calc(5.25rem * var(--grid-scale));
  padding: calc(0.65rem * var(--grid-scale)) calc(0.35rem * var(--grid-scale));
}
.keys-grid .note-single {
  font-size: clamp(calc(1.35rem * var(--grid-scale)), calc(4vw * var(--grid-scale)), calc(1.75rem * var(--grid-scale)));
}
.keys-grid .note-dual {
  font-size: clamp(calc(1.2rem * var(--grid-scale)), calc(3.6vw * var(--grid-scale)), calc(1.55rem * var(--grid-scale)));
}
.piano-shell { width: 100%; max-width: 28rem; }
.piano-shell-scroll {
  max-height: min(70vh, 36rem);
  overflow-y: auto;
  border-radius: 14px;
  border: 1px solid var(--border);
  -webkit-overflow-scrolling: touch;
}
.piano-shell-scroll .piano { max-width: none; border: 0; border-radius: 0; }
.piano-shell-scroll .piano-whites .note { min-height: 2.75rem; height: 2.75rem; }
.piano-shell-scroll .piano-blacks .note {
  height: max(1.55rem, calc(2.75rem * 0.6));
  min-height: max(1.55rem, calc(2.75rem * 0.5));
}
.note.out-of-range { opacity: 0.48; }
.note.out-of-range.active { opacity: 1; }
@media (min-width: 720px) {
  .keys-grid .note { min-height: calc(5.75rem * var(--grid-scale)); }
}

</style>
