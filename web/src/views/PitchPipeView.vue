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
  PITCH_PIPE_PC_KEY_CODES,
  PITCH_PIPE_PIANO_DEFAULT_OCTAVE_OPTIONS,
  PITCH_PIPE_RANGE_OPTIONS,
  SHEET_PIANO_SCALE_MAX,
  SHEET_PIANO_SCALE_MIN,
  SHEET_PIANO_SCALE_STEP,
  isPitchPipePianoLayout,
  pitchPipeAriaLabel,
  pitchPipeDisplay,
  pitchPipeFullKeyboardNotes,
  pitchPipeNotes,
  pitchPipePcKeyNoteMap,
  pitchPipePcKeyOctave,
  pitchPipePcKeyWindowNotes,
  pitchPipeNoteSemitoneShift,
  pitchPipePianoSlots,
  sheetPianoWhiteKeyPx,
  type PitchPipeAHz,
  type PitchPipeLayout,
  type PitchPipePianoDefaultOctave,
  type PitchPipeRange,
} from '../audio/pitchPlayer'
import {
  getActivePitchPipeVoice,
  PITCH_PIPE_SOUND_OPTIONS,
  PITCH_PIPE_VOICE_CHANGE_EVENT,
  type PitchPipeSoundId,
} from '../audio/pitchPipeVoice'
import {
  PIANO_SAMPLE_ENGINE_OPTIONS,
  type PianoSoundEngineId,
} from '../audio/pianoSamples'
import { createPitchTonePlayer, type PitchTonePlayer } from '../audio/pitchTone'
import { usePreferencesStore } from '../stores/preferences'
import { setSessionBusy } from '../lib/sessionActivity'
import PianoHorizontalScroll from '../components/PianoHorizontalScroll.vue'

const prefs = usePreferencesStore()
/** Concert A preset (`null` = custom / “—”). */
const aHz = computed(() => prefs.pitchPipeAHz)
/** Absolute cents vs A440 (slider + playback). */
const detune = computed({
  get: () => prefs.pitchPipeDetuneCents,
  set: (v: number) => prefs.setPitchPipeDetuneCents(v, { clearConcertA: true }),
})
const current = ref<string | null>(null)
/** Polyphonic highlight set (piano layouts). */
const sounding = ref<Set<string>>(new Set())
const keysRef = ref<HTMLElement | null>(null)
const pianoScrollRef = ref<HTMLElement | null>(null)
const pianoHScrollRef = ref<{
  getScrollElement: () => HTMLElement | null
  syncThumb: () => void
  scrollToNote: (note: string, opts?: { behavior?: ScrollBehavior }) => void
} | null>(null)
const sampleStatus = ref<string | null>(null)
/** pointerId → note for multitouch on piano keys. */
const pointerNotes = new Map<number, string>()
const heldPcCodes = new Set<string>()

function syncSoundingFromPlayer(): void {
  sounding.value = new Set(player.activeNotes())
  const notes = player.activeNotes()
  current.value = notes.length ? notes[notes.length - 1]! : null
  setSessionBusy('pitch-pipe', notes.length > 0)
}

function isSounding(note: string): boolean {
  return sounding.value.has(note)
}

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
/** Shared with sheet fullscreen piano dock. */
const pianoKeyScale = computed(() => prefs.sheetPianoKeyScale)
const pianoWhiteKeyPx = computed(() => sheetPianoWhiteKeyPx(pianoKeyScale.value))

const showFullKeyboard = computed({
  get: () => prefs.pitchPipeShowFullKeyboard,
  set: (v: boolean) => prefs.setPitchPipeShowFullKeyboard(v),
})

const pianoEngine = computed({
  get: (): PianoSoundEngineId => prefs.pitchPipePianoEngine,
  set: (v: PianoSoundEngineId) => prefs.setPitchPipePianoEngine(v),
})

const isPianoLayout = computed(() => isPitchPipePianoLayout(pipeLayout.value))
const isHorizontalPiano = computed(() => pipeLayout.value === 'piano-h')

/** Horizontal piano always shows the full strip; vertical uses the toggle. */
const showScrollableKeyboard = computed(
  () => isHorizontalPiano.value || (isPianoLayout.value && showFullKeyboard.value),
)

/** Effective engine for the current layout (grid/list always synth). */
const activeEngine = computed((): PianoSoundEngineId =>
  isPianoLayout.value ? pianoEngine.value : 'synth',
)

let player: PitchTonePlayer = createPitchTonePlayer(
  isPitchPipePianoLayout(prefs.pitchPipeLayout) ? prefs.pitchPipePianoEngine : 'synth',
  { polyphony: isPitchPipePianoLayout(prefs.pitchPipeLayout) },
)

/** Notes in the selected Settings range (always the practice window). */
const rangeNotes = computed(() => pitchPipeNotes(pipeRange.value))

function rebuildPlayer(): void {
  player.allNotesOff(false)
  pointerNotes.clear()
  heldPcCodes.clear()
  const prev = player
  player = createPitchTonePlayer(activeEngine.value, { polyphony: isPianoLayout.value })
  prev.dispose()
  sampleStatus.value = null
  syncSoundingFromPlayer()
  if (isPianoLayout.value && activeEngine.value === 'samples') {
    const mid = rangeNotes.value[Math.floor(rangeNotes.value.length / 2)] ?? 'C4'
    void player.preloadForNote?.(mid).catch(() => {
      sampleStatus.value = player.getLoadError?.() ?? 'Couldn’t load piano samples'
    })
  }
}

/** Octave digit for labels when the setting is on; empty when off. */
function octaveLabel(octave: string): string {
  return showOctave.value ? octave : ''
}

const rangeNoteSet = computed(() => new Set(rangeNotes.value))

/**
 * Keys shown on screen: selected range, or the full 66-key piano when scrolling
 * (horizontal always; vertical when “Show full keyboard” is on).
 */
const noteList = computed(() =>
  showScrollableKeyboard.value ? pitchPipeFullKeyboardNotes() : rangeNotes.value,
)

/** High → low for grid/list / vertical piano focus order. */
const visualNotes = computed(() => [...noteList.value].reverse())

/** Left → right (low → high) for horizontal piano focus. */
const focusNotes = computed(() =>
  isHorizontalPiano.value ? [...noteList.value] : visualNotes.value,
)

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

/**
 * White keys in on-screen order: vertical = high→low (top→bottom);
 * horizontal = low→high (left→right).
 */
const displayWhites = computed(() =>
  isHorizontalPiano.value ? pianoSlots.value.whites : [...pianoSlots.value.whites].reverse(),
)

const whiteKeyPct = computed(() => {
  const n = displayWhites.value.length
  return n > 0 ? 100 / n : 100
})

/** Scroll-driven C octave for PC keys when the full horizontal keyboard is showing. */
const scrollPcOctave = ref<number | null>(null)

const pcKeyWindow = computed(() => {
  if (!isPianoLayout.value) return [] as string[]
  if (showScrollableKeyboard.value) {
    const oct =
      scrollPcOctave.value ??
      (isHorizontalPiano.value
        ? pianoDefaultOctave.value
        : pitchPipePcKeyOctave(rangeNotes.value))
    return pitchPipePcKeyWindowNotes(oct)
  }
  const notes = rangeNotes.value
  // C-based ranges keep a true piano shape (B below C through next D).
  if (notes[0] && /^C\d+$/i.test(notes[0]!)) {
    return pitchPipePcKeyWindowNotes(pitchPipePcKeyOctave(notes))
  }
  // Other ranges: map chromatically from S upward; A is the semitone below the first note.
  const below = notes[0] ? pitchPipeNoteSemitoneShift(notes[0], -1) : null
  const win = below ? [below, ...notes] : [...notes]
  return win.slice(0, PITCH_PIPE_PC_KEY_CODES.length)
})

const pcKeyMap = computed(() => pitchPipePcKeyNoteMap(pcKeyWindow.value))

/** Notes under the current PC-key window (full keyboard dims everything else). */
const pcKeyNoteSet = computed(() => new Set(pcKeyMap.value.values()))

function isOutOfPcWindow(note: string): boolean {
  return showScrollableKeyboard.value && !pcKeyNoteSet.value.has(note)
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || t.isContentEditable
}

function onPcKeyDown(e: KeyboardEvent): void {
  if (!isPianoLayout.value) return
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
  if (isTypingTarget(e.target)) return
  const note = pcKeyMap.value.get(e.code)
  if (!note) return
  e.preventDefault()
  if (heldPcCodes.has(e.code)) return
  heldPcCodes.add(e.code)
  void noteOn(note)
}

function onPcKeyUp(e: KeyboardEvent): void {
  if (!heldPcCodes.has(e.code)) return
  heldPcCodes.delete(e.code)
  const note = pcKeyMap.value.get(e.code)
  if (note) noteOff(note)
}

/** Update which C–C the computer keys cover from the horizontal scroller’s center. */
function syncScrollPcOctave(): void {
  if (!isHorizontalPiano.value) {
    scrollPcOctave.value = null
    return
  }
  const scroller =
    pianoHScrollRef.value?.getScrollElement() ?? pianoScrollRef.value
  if (!scroller) return
  const midX = scroller.scrollLeft + scroller.clientWidth / 2
  const whites = scroller.querySelectorAll<HTMLElement>('.piano-whites .note[data-note]')
  let bestNote: string | null = null
  let bestDist = Infinity
  for (const el of whites) {
    const center = el.offsetLeft + el.offsetWidth / 2
    const d = Math.abs(center - midX)
    if (d < bestDist) {
      bestDist = d
      bestNote = el.dataset.note ?? null
    }
  }
  if (!bestNote) return
  scrollPcOctave.value = pitchPipePcKeyOctave([bestNote])
  if (activeEngine.value === 'samples') {
    void player.preloadForNote?.(bestNote).catch(() => undefined)
  }
}

/** Anchor note for scrolling to the default octave (C of that window). */
function rangeDefaultOctaveNote(): string | null {
  if (isHorizontalPiano.value) return `C${pianoDefaultOctave.value}`
  const notes = rangeNotes.value
  if (notes.length === 0) return null
  const oct = pitchPipePcKeyOctave(notes)
  return `C${oct}`
}

/** Scroll the keyboard so the default octave sits in view. */
function scrollPianoToRange(): void {
  void nextTick(() => {
    if (!isPianoLayout.value) return
    if (!showScrollableKeyboard.value) return
    const anchor = rangeDefaultOctaveNote()
    if (!anchor) return
    if (isHorizontalPiano.value) {
      scrollPcOctave.value = pianoDefaultOctave.value
    } else {
      scrollPcOctave.value = pitchPipePcKeyOctave(rangeNotes.value)
    }
    if (isHorizontalPiano.value && pianoHScrollRef.value) {
      pianoHScrollRef.value.scrollToNote(anchor)
      syncScrollPcOctave()
      return
    }
    const scroller = pianoScrollRef.value
    if (!scroller) return
    const target = scroller.querySelector<HTMLElement>(
      `button.note[data-note="${CSS.escape(anchor)}"]`,
    )
    target?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
  })
}

function nudgePianoKeyScale(delta: number): void {
  prefs.nudgeSheetPianoKeyScale(delta)
  void nextTick(() => scrollPianoToRange())
}

onMounted(() => {
  window.addEventListener('keydown', onPcKeyDown)
  window.addEventListener('keyup', onPcKeyUp)
  window.addEventListener('blur', onWindowBlur)
  scrollPianoToRange()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onPcKeyDown)
  window.removeEventListener('keyup', onPcKeyUp)
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener(PITCH_PIPE_VOICE_CHANGE_EVENT, syncPitchVoice)
  setSessionBusy('pitch-pipe', false)
  player.dispose()
})

function onWindowBlur(): void {
  heldPcCodes.clear()
  pointerNotes.clear()
  player.allNotesOff(true)
  syncSoundingFromPlayer()
}

function syncPitchVoice(): void {
  if (activeEngine.value === 'synth') {
    player.setVoice(getActivePitchPipeVoice())
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener(PITCH_PIPE_VOICE_CHANGE_EVENT, syncPitchVoice)
}

watch(detune, (cents) => {
  const notes = player.activeNotes()
  for (const n of notes) void player.noteOn(n, cents)
})

watch(pipeRange, () => {
  const active = player.activeNotes()
  for (const n of active) {
    if (!noteList.value.includes(n)) noteOff(n)
  }
  if (!isHorizontalPiano.value) scrollPianoToRange()
})

watch(pianoDefaultOctave, () => {
  if (isHorizontalPiano.value) scrollPianoToRange()
})

watch([showFullKeyboard, pipeLayout], () => {
  heldPcCodes.clear()
  pointerNotes.clear()
  scrollPianoToRange()
})

watch([activeEngine, isPianoLayout], () => {
  rebuildPlayer()
})

async function noteOn(note: string): Promise<void> {
  try {
    await player.noteOn(note, detune.value)
    sampleStatus.value = null
  } catch {
    sampleStatus.value = player.getLoadError?.() ?? 'Couldn’t play note'
  }
  syncSoundingFromPlayer()
}

function noteOff(note: string): void {
  player.noteOff(note, true)
  syncSoundingFromPlayer()
}

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

function onPianoPointerDown(e: PointerEvent, note: string): void {
  if (e.button !== 0 && e.pointerType === 'mouse') return
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  pointerNotes.set(e.pointerId, note)
  void noteOn(note)
}

function onPianoPointerUp(e: PointerEvent): void {
  const note = pointerNotes.get(e.pointerId)
  if (!note) return
  pointerNotes.delete(e.pointerId)
  noteOff(note)
}

function onNoteKey(e: KeyboardEvent, note: string): void {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    if (e.type === 'keydown' && !e.repeat) {
      if (isPianoLayout.value) void noteOn(note)
      else void down(note)
    }
    if (e.type === 'keyup') {
      if (isPianoLayout.value) noteOff(note)
      else up()
    }
  }
}

function focusNeighbor(e: KeyboardEvent, note: string): void {
  const order = focusNotes.value
  const cols = pipeLayout.value === 'grid' ? PITCH_PIPE_GRID_COLS : 1
  const index = order.indexOf(note)
  if (index < 0) return
  const max = order.length - 1
  let next = index
  // Horizontal piano: Left/Right step pitch; vertical / grid use existing visual order.
  if (e.key === 'ArrowRight') next = Math.min(max, index + 1)
  else if (e.key === 'ArrowLeft') next = Math.max(0, index - 1)
  else if (e.key === 'ArrowDown') next = Math.min(max, index + cols)
  else if (e.key === 'ArrowUp') next = Math.max(0, index - cols)
  else return
  e.preventDefault()
  const target = order[next]
  if (!target) return
  const root =
    pianoHScrollRef.value?.getScrollElement() ?? pianoScrollRef.value ?? keysRef.value
  const btn = root?.querySelector<HTMLButtonElement>(
    `button.note[data-note="${CSS.escape(target)}"]`,
  )
  btn?.focus()
}

/** Black key sits on the boundary above the lower white (`after`) toward the higher white. */
function blackTopPct(after: string): number {
  const idx = displayWhites.value.indexOf(after)
  if (idx < 0) return 0
  return idx * whiteKeyPct.value
}

/** Black key sits on the boundary to the right of the lower white (`after`). */
function blackLeftPct(after: string): number {
  const idx = displayWhites.value.indexOf(after)
  if (idx < 0) return 0
  return (idx + 1) * whiteKeyPct.value
}
</script>

<template>
  <section class="pipe" :class="{ 'pipe-wide': isHorizontalPiano }" aria-label="Pitch pipe">
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
          <span v-if="sampleStatus" class="sample-err"> {{ sampleStatus }}</span>
        </p>

        <label class="range-ref">
          <span class="lbl">Layout</span>
          <select v-model="pipeLayout" aria-label="Pitch pipe layout">
            <option v-for="r in PITCH_PIPE_LAYOUT_OPTIONS" :key="r.value" :value="r.value">
              {{ r.label }}
            </option>
          </select>
        </label>

        <label v-if="isHorizontalPiano" class="range-ref">
          <span class="lbl">Default octave</span>
          <select
            v-model="pianoDefaultOctave"
            aria-label="Default piano octave"
            title="Which C–C octave the horizontal piano opens on (drag to change)"
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

        <div
          v-if="isHorizontalPiano"
          class="scale-controls"
          role="group"
          aria-label="Piano zoom"
        >
          <span class="lbl">Piano zoom</span>
          <button
            type="button"
            class="btn btn-ghost scale-btn"
            :disabled="pianoKeyScale <= SHEET_PIANO_SCALE_MIN"
            aria-label="Zoom out (more keys)"
            @click="nudgePianoKeyScale(-SHEET_PIANO_SCALE_STEP)"
          >
            −
          </button>
          <span class="scale-value" aria-live="polite">{{ pianoKeyScale }}%</span>
          <button
            type="button"
            class="btn btn-ghost scale-btn"
            :disabled="pianoKeyScale >= SHEET_PIANO_SCALE_MAX"
            aria-label="Zoom in (fewer keys)"
            @click="nudgePianoKeyScale(SHEET_PIANO_SCALE_STEP)"
          >
            +
          </button>
        </div>

        <label
          v-if="isPianoLayout && !isHorizontalPiano"
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

    <div class="stage" :class="{ 'stage-piano-h': isHorizontalPiano }">
      <div
        v-if="isPianoLayout && !isHorizontalPiano"
        ref="pianoScrollRef"
        class="piano-shell"
        :class="{ 'piano-shell-scroll': showFullKeyboard }"
      >
        <div
          ref="keysRef"
          class="piano"
          role="group"
          :aria-label="`Pitch pipe piano (${pipeRange})`"
          :style="{ '--white-count': displayWhites.length }"
        >
          <div class="piano-whites">
            <button
              v-for="note in displayWhites"
              :key="note"
              type="button"
              class="note natural"
              :data-note="note"
              :class="{
                active: isSounding(note),
                'out-of-range': isOutOfPcWindow(note),
              }"
              :aria-pressed="isSounding(note)"
              :aria-label="byNote.get(note)?.aria"
              @pointerdown.prevent="onPianoPointerDown($event, note)"
              @pointerup.prevent="onPianoPointerUp"
              @pointercancel.prevent="onPianoPointerUp"
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
                active: isSounding(b.note),
                'out-of-range': isOutOfPcWindow(b.note),
              }"
              :style="{ top: `${blackTopPct(b.after)}%` }"
              :aria-pressed="isSounding(b.note)"
              :aria-label="byNote.get(b.note)?.aria"
              @pointerdown.prevent="onPianoPointerDown($event, b.note)"
              @pointerup.prevent="onPianoPointerUp"
              @pointercancel.prevent="onPianoPointerUp"
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

      <div v-else-if="isHorizontalPiano" class="piano-shell piano-shell-h">
        <PianoHorizontalScroll
          ref="pianoHScrollRef"
          @note-on="noteOn"
          @note-off="noteOff"
          @scroll="syncScrollPcOctave"
        >
          <div
            ref="keysRef"
            class="piano piano-h"
            role="group"
            :aria-label="`Pitch pipe piano (${pipeRange})`"
            :style="{
              '--white-count': displayWhites.length,
              '--white-w': `${pianoWhiteKeyPx}px`,
            }"
          >
            <div class="piano-whites">
              <button
                v-for="note in displayWhites"
                :key="note"
                type="button"
                class="note natural"
                :data-note="note"
                :class="{
                  active: isSounding(note),
                'out-of-range': isOutOfPcWindow(note),
              }"
              :aria-pressed="isSounding(note)"
              :aria-label="byNote.get(note)?.aria"
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
                active: isSounding(b.note),
                'out-of-range': isOutOfPcWindow(b.note),
              }"
                :style="{ left: `${blackLeftPct(b.after)}%` }"
                :aria-pressed="isSounding(b.note)"
                :aria-label="byNote.get(b.note)?.aria"
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
        </PianoHorizontalScroll>
      </div>

      <p v-if="isPianoLayout" class="pc-keys-hint" aria-live="polite">
        On desktop, use your keyboard to play this polyphonic keyboard.
        <template v-if="isHorizontalPiano"> Drag keys to change octave.</template>
      </p>

      <div
        v-if="!isPianoLayout"
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
.stage-piano-h {
  align-items: stretch;
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
.piano-shell-h {
  max-width: none;
  overflow: visible;
}
.piano-shell-h :deep(.piano-h-scroller) {
  border-radius: 14px;
  border: 1px solid var(--border);
}
.piano-shell-h .piano {
  border: 0;
  border-radius: 0;
}
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
.piano-h {
  max-width: none;
  width: max-content;
  min-width: 100%;
  height: 11.5rem;
  --white-w: 51px;
}
.piano-h .piano-whites {
  flex-direction: row;
  height: 100%;
  width: calc(var(--white-count) * var(--white-w));
}
.piano-h .piano-whites .note {
  flex: 0 0 var(--white-w);
  min-width: var(--white-w);
  width: var(--white-w);
  min-height: 0;
  height: 100%;
  border-width: 0 1px 0 0;
  border-color: var(--border);
  justify-content: flex-end;
  align-items: flex-end;
  padding: 0.55rem 0.35rem;
  writing-mode: horizontal-tb;
}
.piano-h .piano-whites .note:last-child {
  border-right: 0;
  border-bottom: 0;
}
.piano-h .piano-blacks .note {
  top: 0;
  right: auto;
  width: max(1.55rem, calc(var(--white-w) * 0.62));
  height: 58%;
  min-height: 0;
  transform: translateX(-50%);
  border-radius: 0 0 8px 8px;
  padding: 0.3rem 0.2rem;
  align-items: flex-start;
}
.piano-h .piano-blacks .note-dual {
  flex-direction: column;
  font-size: clamp(0.72rem, 1.8vw, 0.95rem);
  gap: 0.05rem;
}
.piano-h .note-sep { display: none; }
.pc-keys-hint {
  margin: 0;
  padding: 0 0.15rem;
  font-size: 0.85rem;
  color: var(--muted);
  line-height: 1.45;
  text-align: center;
}
/* Opaque muted fills — opacity would show accent through overlapping black keys. */
.note.out-of-range.natural {
  background: color-mix(in srgb, var(--surface) 55%, var(--border));
  color: color-mix(in srgb, var(--text) 42%, var(--surface));
  border-color: color-mix(in srgb, var(--border) 85%, var(--surface));
}
.note.out-of-range.black {
  background: color-mix(in srgb, var(--text) 18%, var(--surface));
  color: color-mix(in srgb, var(--text) 38%, var(--surface));
  border-color: color-mix(in srgb, var(--text) 28%, var(--border));
  box-shadow: none;
}
.note.out-of-range.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
@media (min-width: 720px) {
  .keys-grid .note { min-height: calc(5.75rem * var(--grid-scale)); }
  .piano-h { height: 13rem; }
  .piano-h .piano-blacks .note {
    width: max(1.75rem, calc(var(--white-w) * 0.62));
  }
}

</style>
