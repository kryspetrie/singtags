<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  PITCH_PIPE_A_TUNINGS,
  PITCH_PIPE_GRID_COLS,
  PITCH_PIPE_LAYOUT_OPTIONS,
  PITCH_PIPE_RANGE_OPTIONS,
  pitchPipeAriaLabel,
  pitchPipeDisplay,
  pitchPipeNotes,
  pitchPipePianoSlots,
  PitchPlayer,
  type PitchPipeAHz,
  type PitchPipeLayout,
  type PitchPipeRange,
} from '../audio/pitchPlayer'
import { usePreferencesStore } from '../stores/preferences'

const prefs = usePreferencesStore()
const player = new PitchPlayer()
/** Concert A preset (`null` = custom / “—”). */
const aHz = computed(() => prefs.pitchPipeAHz)
/** Absolute cents vs A440 (slider + playback). */
const detune = computed({
  get: () => prefs.pitchPipeDetuneCents,
  set: (v: number) => prefs.setPitchPipeDetuneCents(v, { clearConcertA: true }),
})
const current = ref<string | null>(null)
const keysRef = ref<HTMLElement | null>(null)

const concertASelectValue = computed(() => (aHz.value == null ? 'custom' : String(aHz.value)))

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

const noteList = computed(() => pitchPipeNotes(pipeRange.value))

/** High → low for on-screen order (highest pitches at the top). */
const visualNotes = computed(() => [...noteList.value].reverse())

const noteRows = computed(() =>
  visualNotes.value.map((note) => {
    const display = pitchPipeDisplay(note)
    return {
      note,
      display,
      aria: pitchPipeAriaLabel(note),
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

onUnmounted(() => player.dispose())

watch(detune, (cents) => {
  if (current.value) void player.start(current.value, cents)
})

watch(pipeRange, () => {
  if (current.value && !noteList.value.includes(current.value)) {
    up()
  }
})

async function down(note: string): Promise<void> {
  current.value = note
  await player.start(note, detune.value)
}

function up(): void {
  current.value = null
  player.stop(true)
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
  const btn = keysRef.value?.querySelector<HTMLButtonElement>(
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
            :class="{ active: current === note }"
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
              >{{ byNote.get(note)?.display.sharp }}{{ byNote.get(note)?.display.octave }}</span
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
            :class="{ active: current === b.note }"
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
                >{{ byNote.get(b.note)?.display.sharp }}{{ byNote.get(b.note)?.display.octave }}</span
              >
              <span class="note-sep" aria-hidden="true">/</span>
              <span class="note-flat"
                >{{ byNote.get(b.note)?.display.flat }}{{ byNote.get(b.note)?.display.octave }}</span
              >
            </span>
          </button>
        </div>
      </div>

      <div
        v-else
        ref="keysRef"
        class="keys"
        :class="pipeLayout === 'list' ? 'keys-list' : 'keys-grid'"
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
            <span class="note-sharp">{{ entry.display.sharp }}{{ entry.display.octave }}</span>
            <span class="note-sep" aria-hidden="true">/</span>
            <span class="note-flat">{{ entry.display.flat }}{{ entry.display.octave }}</span>
          </span>
          <span v-else class="note-single"
            >{{ entry.display.sharp }}{{ entry.display.octave }}</span
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
</style>
