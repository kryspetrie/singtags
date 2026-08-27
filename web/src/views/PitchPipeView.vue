<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  PITCH_PIPE_A_TUNINGS,
  PITCH_PIPE_GRID_COLS,
  PITCH_PIPE_NATURAL_COLORS,
  PITCH_PIPE_RANGE_OPTIONS,
  aHzToCents,
  pitchPipeAriaLabel,
  pitchPipeDisplay,
  pitchPipeNotes,
  PitchPlayer,
  type PitchPipeAHz,
  type PitchPipeRange,
} from '../audio/pitchPlayer'
import { usePreferencesStore } from '../stores/preferences'

const prefs = usePreferencesStore()
const player = new PitchPlayer()
/** Concert A reference (Hz). */
const aHz = ref<PitchPipeAHz>(440)
/** Extra fine adjust in cents on top of the selected A. */
const fineCents = ref(0)
const current = ref<string | null>(null)
const gridRef = ref<HTMLElement | null>(null)

const baseCents = computed(() => aHzToCents(aHz.value))
const detune = computed(() => baseCents.value + fineCents.value)
const detuneLabel = computed(() => {
  const n = detune.value
  const sign = n > 0 ? '+' : ''
  return `${sign}${n} cents`
})

const pipeRange = computed({
  get: (): PitchPipeRange => prefs.pitchPipeRange,
  set: (v: PitchPipeRange) => prefs.setPitchPipeRange(v),
})

const noteList = computed(() => pitchPipeNotes(pipeRange.value))

const noteRows = computed(() =>
  noteList.value.map((note) => {
    const display = pitchPipeDisplay(note)
    return {
      note,
      display,
      aria: pitchPipeAriaLabel(note),
      accent: PITCH_PIPE_NATURAL_COLORS[display.pitchClass] ?? 'var(--accent)',
    }
  }),
)

onMounted(() => {
  /* AudioContext created on first press (browser autoplay policy). */
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

function resetDetune(): void {
  aHz.value = 440
  fineCents.value = 0
}

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

function focusNeighbor(e: KeyboardEvent, index: number): void {
  const cols = PITCH_PIPE_GRID_COLS
  const max = noteList.value.length - 1
  let next = index
  if (e.key === 'ArrowRight') next = Math.min(max, index + 1)
  else if (e.key === 'ArrowLeft') next = Math.max(0, index - 1)
  else if (e.key === 'ArrowDown') next = Math.min(max, index + cols)
  else if (e.key === 'ArrowUp') next = Math.max(0, index - cols)
  else return
  e.preventDefault()
  const btn = gridRef.value?.querySelectorAll<HTMLButtonElement>('button.note')[next]
  btn?.focus()
}
</script>

<template>
  <section class="pipe" aria-label="Pitch pipe">
    <p class="muted intro">
      Press and hold a pitch. Chromatic notes show sharp and flat names. Choose F3–F4 or E3–E4,
      set concert A, then fine-tune ±50 cents if needed.
    </p>

    <div class="tuning" role="group" aria-label="Pitch pipe tuning">
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
        <select v-model.number="aHz" aria-label="Concert A frequency">
          <option v-for="t in PITCH_PIPE_A_TUNINGS" :key="t.hz" :value="t.hz">
            {{ t.label }}
          </option>
        </select>
      </label>

      <label class="detune">
        <span class="lbl">Fine detune <strong>{{ detuneLabel }}</strong></span>
        <input
          v-model.number="fineCents"
          type="range"
          min="-50"
          max="50"
          step="1"
          aria-valuemin="-50"
          aria-valuemax="50"
          :aria-valuenow="fineCents"
          aria-label="Fine detune in cents"
        />
      </label>

      <button
        type="button"
        class="btn reset"
        :disabled="aHz === 440 && fineCents === 0"
        title="Reset to A = 440 Hz with no fine detune"
        @click="resetDetune"
      >
        Reset
      </button>
    </div>

    <div
      ref="gridRef"
      class="grid"
      role="group"
      :aria-label="`Pitch pipe notes (${pipeRange})`"
    >
      <button
        v-for="(entry, i) in noteRows"
        :key="entry.note"
        type="button"
        class="note"
        :class="{ active: current === entry.note, black: entry.display.isBlack, natural: !entry.display.isBlack }"
        :style="entry.display.isBlack ? undefined : { '--note-accent': entry.accent }"
        :aria-pressed="current === entry.note"
        :aria-label="entry.aria"
        @pointerdown.prevent="down(entry.note)"
        @pointerup.prevent="up"
        @pointerleave.prevent="up"
        @pointercancel.prevent="up"
        @keydown="onNoteKey($event, entry.note); focusNeighbor($event, i)"
        @keyup="onNoteKey($event, entry.note)"
      >
        <span v-if="entry.display.isBlack && entry.display.sharp && entry.display.flat" class="note-dual">
          <span class="note-line note-sharp">{{ entry.display.sharp }}{{ entry.display.octave }}</span>
          <span class="note-line note-flat">{{ entry.display.flat }}{{ entry.display.octave }}</span>
        </span>
        <span v-else class="note-single">{{ entry.display.sharp }}{{ entry.display.octave }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.muted {
  color: var(--muted);
}
.intro {
  margin: 0 0 0.25rem;
  line-height: 1.45;
  max-width: 40rem;
}
.tuning {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  align-items: flex-end;
  margin: 1rem 0 1.25rem;
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
.grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.55rem;
  max-width: 36rem;
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
}
.note-single {
  font-size: clamp(1.35rem, 4vw, 1.75rem);
  line-height: 1.1;
  color: var(--note-accent, var(--text));
}
.note-dual {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  line-height: 1.05;
  width: 100%;
}
.note-line {
  display: block;
}
.note-sharp {
  font-size: clamp(1.15rem, 3.5vw, 1.45rem);
}
.note-flat {
  font-size: clamp(1.15rem, 3.5vw, 1.45rem);
  opacity: 0.92;
}
.note.natural {
  background: color-mix(in srgb, var(--note-accent, var(--accent)) 12%, var(--surface));
  border-color: color-mix(in srgb, var(--note-accent, var(--accent)) 45%, var(--border));
}
.note.black {
  background: #151515;
  color: #f8f8f8;
  border-color: #0a0a0a;
}
.note.active {
  outline: 3px solid var(--accent);
  outline-offset: 1px;
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.note.active.natural,
.note.active.black {
  color: #fff;
}
@media (min-width: 720px) {
  .grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    max-width: 44rem;
  }
  .note {
    min-height: 5.75rem;
  }
}
</style>
