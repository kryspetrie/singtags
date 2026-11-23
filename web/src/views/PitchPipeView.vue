<script setup lang="ts">
/**
 * Chromatic pitch pipe page: concert-A tuning, note range/layout prefs, hold-to-play keys.
 * Piano layout reuses the fullscreen-tag SheetPianoDock (full horizontal keyboard).
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  PITCH_PIPE_A_TUNINGS,
  PITCH_PIPE_GRID_COLS,
  PITCH_PIPE_GRID_SCALE_MAX,
  PITCH_PIPE_GRID_SCALE_MIN,
  PITCH_PIPE_LAYOUT_OPTIONS,
  PITCH_PIPE_PIANO_DEFAULT_OCTAVE_OPTIONS,
  PITCH_PIPE_RANGE_OPTIONS,
  isPitchPipePianoLayout,
  pitchPipeAriaLabel,
  pitchPipeDisplay,
  pitchPipeNotes,
  type PitchPipeAHz,
  type PitchPipeLayout,
  type PitchPipePianoDefaultOctave,
  type PitchPipeRange,
} from '../audio/pitchPlayer'
import {
  getActivePitchPipeVoice,
  PITCH_PIPE_ATTACK_SEC_MAX,
  PITCH_PIPE_ATTACK_SEC_MIN,
  PITCH_PIPE_ATTACK_SEC_STEP,
  PITCH_PIPE_SOUND_OPTIONS,
  PITCH_PIPE_VOICE_CHANGE_EVENT,
  type PitchPipeSoundId,
  type PitchPipeVoiceConfig,
} from '../audio/pitchPipeVoice'
import {
  PIANO_SAMPLE_ENGINE_OPTIONS,
  type PianoSoundEngineId,
} from '../audio/pianoSamples'
import { createPitchTonePlayer, type PitchTonePlayer } from '../audio/pitchTone'
import { usePreferencesStore } from '../stores/preferences'
import { setSessionBusy } from '../lib/sessionActivity'
import SheetPianoDock from '../components/SheetPianoDock.vue'

const prefs = usePreferencesStore()
/** Concert A preset (`null` = custom / “—”). */
const aHz = computed(() => prefs.pitchPipeAHz)
/** Absolute cents vs A440 (slider + playback). */
const detune = computed({
  get: () => prefs.pitchPipeDetuneCents,
  set: (v: number) => prefs.setPitchPipeDetuneCents(v, { clearConcertA: true }),
})
const current = ref<string | null>(null)
const keysRef = ref<HTMLElement | null>(null)
const sampleStatus = ref<string | null>(null)

function syncSoundingFromPlayer(): void {
  const notes = player.activeNotes()
  current.value = notes.length ? notes[notes.length - 1]! : null
  setSessionBusy('pitch-pipe', notes.length > 0)
}

const concertASelectValue = computed(() => (aHz.value == null ? 'custom' : String(aHz.value)))

const pipeSound = computed({
  get: (): PitchPipeSoundId => prefs.pitchPipeSound,
  set: (v: PitchPipeSoundId) => prefs.setPitchPipeSound(v),
})

const attackSec = computed({
  get: () => prefs.pitchPipeAttackSec,
  set: (v: number) => prefs.setPitchPipeAttackSec(v),
})

const attackLabel = computed(() => {
  const n = attackSec.value
  if (n <= 0) return 'instant'
  if (n < 1) return `${Math.round(n * 1000)} ms`
  return `${n.toFixed(2).replace(/\.?0+$/, '')} s`
})

/** Active synth voice with the Settings attack overlay. */
function pipeVoice(): PitchPipeVoiceConfig {
  return { ...getActivePitchPipeVoice(), attackSec: attackSec.value }
}

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

const pianoDefaultOctave = computed({
  get: (): PitchPipePianoDefaultOctave => prefs.pitchPipePianoDefaultOctave,
  set: (v: PitchPipePianoDefaultOctave) => prefs.setPitchPipePianoDefaultOctave(v),
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

const showPcKeyRange = computed({
  get: () => prefs.pitchPipeShowPcKeyRange,
  set: (v: boolean) => prefs.setPitchPipeShowPcKeyRange(v),
})

const pianoEngine = computed({
  get: (): PianoSoundEngineId => prefs.pitchPipePianoEngine,
  set: (v: PianoSoundEngineId) => prefs.setPitchPipePianoEngine(v),
})

const isPianoLayout = computed(() => isPitchPipePianoLayout(pipeLayout.value))

/** Grid/list always synth; piano uses SheetPianoDock’s own player. */
const showSynthAttack = computed(
  () => !isPianoLayout.value || pianoEngine.value === 'synth',
)

let player: PitchTonePlayer = createPitchTonePlayer('synth', { polyphony: false })

/** Notes in the selected Settings range (grid/list practice window). */
const rangeNotes = computed(() => pitchPipeNotes(pipeRange.value))

function rebuildPlayer(): void {
  player.allNotesOff(false)
  const prev = player
  player = createPitchTonePlayer('synth', { polyphony: false })
  prev.dispose()
  sampleStatus.value = null
  syncSoundingFromPlayer()
  void player.warmUp?.()
  syncPitchVoice()
}

/** Octave digit for labels when the setting is on; empty when off. */
function octaveLabel(octave: string): string {
  return showOctave.value ? octave : ''
}

/** High → low for grid/list focus order. */
const visualNotes = computed(() => [...rangeNotes.value].reverse())

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

/** Center the shared piano dock on the chosen default-octave C. */
const pianoCenterNote = computed(() => `C${pianoDefaultOctave.value}`)

/** Unlock AudioContext on the first gesture so the first key isn’t waiting on resume(). */
function armAudioFromGesture(): void {
  void player.warmUp?.()
}

onMounted(() => {
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('pointerdown', armAudioFromGesture, { capture: true, once: true })
  window.addEventListener('keydown', armAudioFromGesture, { capture: true, once: true })
  syncPitchVoice()
})

onUnmounted(() => {
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener('pointerdown', armAudioFromGesture, true)
  window.removeEventListener('keydown', armAudioFromGesture, true)
  window.removeEventListener(PITCH_PIPE_VOICE_CHANGE_EVENT, syncPitchVoice)
  setSessionBusy('pitch-pipe', false)
  player.dispose()
})

function onWindowBlur(): void {
  player.allNotesOff(true)
  syncSoundingFromPlayer()
}

function syncPitchVoice(): void {
  player.setVoice(pipeVoice())
}

if (typeof window !== 'undefined') {
  window.addEventListener(PITCH_PIPE_VOICE_CHANGE_EVENT, syncPitchVoice)
}

watch(attackSec, () => {
  syncPitchVoice()
})

watch(detune, (cents) => {
  if (isPianoLayout.value) return
  const notes = player.activeNotes()
  for (const n of notes) void player.noteOn(n, cents)
})

watch(pipeRange, () => {
  if (isPianoLayout.value) return
  const active = player.activeNotes()
  for (const n of active) {
    if (!rangeNotes.value.includes(n)) up()
  }
})

watch(isPianoLayout, (piano) => {
  player.allNotesOff(true)
  syncSoundingFromPlayer()
  if (!piano) rebuildPlayer()
})

/** Grid/list monophonic hold helpers. */
async function down(note: string): Promise<void> {
  try {
    await player.start(note, detune.value)
    sampleStatus.value = null
  } catch {
    sampleStatus.value = player.getLoadError?.() ?? 'Couldn’t play note'
  }
  syncSoundingFromPlayer()
}

function up(): void {
  player.stop(true)
  syncSoundingFromPlayer()
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
</script>

<template>
  <section class="pipe" :class="{ 'pipe-wide': isPianoLayout }" aria-label="Pitch pipe">
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

        <label v-if="isPianoLayout" class="range-ref">
          <span class="lbl">Piano sound</span>
          <select v-model="pianoEngine" aria-label="Piano sound engine">
            <option v-for="s in PIANO_SAMPLE_ENGINE_OPTIONS" :key="s.value" :value="s.value">
              {{ s.label }}
            </option>
          </select>
        </label>
        <p v-if="isPianoLayout && pianoEngine === 'samples'" class="sample-hint">
          Acoustic samples load per octave as you play or scroll.
        </p>

        <label v-if="showSynthAttack" class="detune">
          <span class="lbl">Attack <strong>{{ attackLabel }}</strong></span>
          <input
            v-model.number="attackSec"
            type="range"
            :min="PITCH_PIPE_ATTACK_SEC_MIN"
            :max="PITCH_PIPE_ATTACK_SEC_MAX"
            :step="PITCH_PIPE_ATTACK_SEC_STEP"
            :aria-valuemin="PITCH_PIPE_ATTACK_SEC_MIN"
            :aria-valuemax="PITCH_PIPE_ATTACK_SEC_MAX"
            :aria-valuenow="attackSec"
            aria-label="Pitch pipe attack fade-in"
            title="Fade in from 25% to full level over this time (synth only)"
          />
        </label>

        <label class="range-ref">
          <span class="lbl">Layout</span>
          <select v-model="pipeLayout" aria-label="Pitch pipe layout">
            <option v-for="r in PITCH_PIPE_LAYOUT_OPTIONS" :key="r.value" :value="r.value">
              {{ r.label }}
            </option>
          </select>
        </label>

        <label v-if="isPianoLayout" class="range-ref">
          <span class="lbl">Default octave</span>
          <select
            v-model="pianoDefaultOctave"
            aria-label="Default piano octave"
            title="Center the piano so this C–C window is in view"
          >
            <option
              v-for="r in PITCH_PIPE_PIANO_DEFAULT_OCTAVE_OPTIONS"
              :key="r.value"
              :value="r.value"
            >
              {{ r.label }}
            </option>
          </select>
        </label>

        <label v-else class="range-ref">
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
          v-if="isPianoLayout"
          class="setting-row"
          :class="{ on: showPcKeyRange }"
          title="Dim keys outside the computer-keyboard window (A–' / S–L). Turn off on mobile if the highlight is distracting."
        >
          <span class="setting-copy">
            <span class="setting-title">Show desktop keyboard range</span>
          </span>
          <input
            v-model="showPcKeyRange"
            type="checkbox"
            class="setting-switch"
            role="switch"
            :aria-checked="showPcKeyRange"
            aria-label="Show desktop keyboard range"
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

    <div class="stage" :class="{ 'stage-piano': isPianoLayout }" @contextmenu.prevent>
      <SheetPianoDock
        v-if="isPianoLayout"
        variant="page"
        :center-note="pianoCenterNote"
      />

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
.pipe-wide {
  max-width: min(100%, 72rem);
  display: flex;
  flex-direction: column;
  min-height: calc(100dvh - var(--header-h, 3.5rem));
  box-sizing: border-box;
}
.pipe-wide .settings {
  flex: 0 0 auto;
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
.sample-hint {
  flex: 1 1 100%;
  margin: 0;
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.35;
}
.sample-err {
  color: var(--danger, #b42318);
  font-weight: 600;
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
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}
.stage-piano {
  flex: 1 1 auto;
  align-items: stretch;
  min-height: 0;
  width: 100%;
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
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
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
  color: var(--on-accent);
  border-color: var(--accent);
}

@media (min-width: 720px) {
  .keys-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    max-width: 44rem;
  }
  .keys-grid .note {
    min-height: 5.75rem;
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
@media (min-width: 720px) {
  .keys-grid .note { min-height: calc(5.75rem * var(--grid-scale)); }
}
</style>
