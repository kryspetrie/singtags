<script setup lang="ts">
/**
 * Stubby horizontal piano dock for fullscreen sheet view.
 * Scale adjusts key size; at 100% keys keep a fixed px width so wider screens
 * (and landscape) show more keys. Drag pans; focused octave stays lit for PC keys.
 * Sound engine (synth vs samples) follows Pitch Pipe → Piano sound setting.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  pitchPipeAriaLabel,
  pitchPipeDisplay,
  pitchPipeFullKeyboardNotes,
  pitchPipePcKeyNoteMap,
  pitchPipePcKeyOctave,
  pitchPipePcKeyWindowNotes,
  pitchPipePianoSlots,
  SHEET_PIANO_SCALE_MAX,
  SHEET_PIANO_SCALE_MIN,
  SHEET_PIANO_SCALE_STEP,
  sheetPianoWhiteKeyPx,
} from '../audio/pitchPlayer'
import { getActivePitchPipeVoice, PITCH_PIPE_VOICE_CHANGE_EVENT } from '../audio/pitchPipeVoice'
import { createPitchTonePlayer, type PitchTonePlayer } from '../audio/pitchTone'
import { usePreferencesStore } from '../stores/preferences'
import { setSessionBusy } from '../lib/sessionActivity'
import PianoHorizontalScroll from './PianoHorizontalScroll.vue'

const props = withDefaults(
  defineProps<{
    /** Center the strip on this note when opened / when centerNote changes. */
    centerNote?: string | null
  }>(),
  { centerNote: 'C4' },
)

const emit = defineEmits<{
  close: []
  /** Dock height changed — parent should reflow the sheet viewport. */
  resize: []
}>()

const prefs = usePreferencesStore()
let player: PitchTonePlayer = createPitchTonePlayer(prefs.pitchPipePianoEngine, {
  polyphony: true,
})

const sounding = ref<Set<string>>(new Set())
const shellRef = ref<HTMLElement | null>(null)
const pianoHScrollRef = ref<{
  getScrollElement: () => HTMLElement | null
  syncThumb: () => void
  scrollToNote: (note: string, opts?: { behavior?: ScrollBehavior }) => void
} | null>(null)
const sampleStatus = ref<string | null>(null)
const showOctave = computed(() => prefs.pitchPipeShowOctave)
const detune = computed(() => prefs.pitchPipeDetuneCents)
const keyScale = computed(() => prefs.sheetPianoKeyScale)
const whiteKeyPx = computed(() => sheetPianoWhiteKeyPx(keyScale.value))
const pianoEngine = computed(() => prefs.pitchPipePianoEngine)

function syncSounding(): void {
  sounding.value = new Set(player.activeNotes())
  setSessionBusy('sheet-piano', sounding.value.size > 0)
}

function isSounding(note: string): boolean {
  return sounding.value.has(note)
}

const noteList = computed(() => pitchPipeFullKeyboardNotes())

const byNote = computed(() => {
  const map = new Map<
    string,
    { note: string; display: ReturnType<typeof pitchPipeDisplay>; aria: string }
  >()
  for (const note of noteList.value) {
    const display = pitchPipeDisplay(note)
    map.set(note, {
      note,
      display,
      aria: pitchPipeAriaLabel(note),
    })
  }
  return map
})

const pianoSlots = computed(() => pitchPipePianoSlots(noteList.value))
const displayWhites = computed(() => pianoSlots.value.whites)
const whiteKeyPct = computed(() => {
  const n = displayWhites.value.length
  return n > 0 ? 100 / n : 100
})

function blackLeftPct(after: string): number {
  const idx = displayWhites.value.indexOf(after)
  if (idx < 0) return 0
  return (idx + 1) * whiteKeyPct.value
}

function octaveLabel(octave: string): string {
  return showOctave.value ? octave : ''
}

function rebuildPlayer(): void {
  player.allNotesOff(false)
  heldPcCodes.clear()
  const prev = player
  player = createPitchTonePlayer(pianoEngine.value, { polyphony: true })
  prev.dispose()
  sampleStatus.value = null
  syncSounding()
  if (pianoEngine.value === 'samples') {
    void player.preloadForNote?.(props.centerNote || 'C4').catch(() => {
      sampleStatus.value = player.getLoadError?.() ?? 'Couldn’t load piano samples'
    })
  }
}

async function noteOn(note: string): Promise<void> {
  try {
    await player.noteOn(note, detune.value)
    sampleStatus.value = null
  } catch {
    sampleStatus.value = player.getLoadError?.() ?? 'Couldn’t play note'
  }
  syncSounding()
}

function noteOff(note: string): void {
  player.noteOff(note, true)
  syncSounding()
}

watch(detune, (cents) => {
  for (const n of player.activeNotes()) void player.noteOn(n, cents)
})

watch(pianoEngine, () => rebuildPlayer())

function syncPitchVoice(): void {
  if (pianoEngine.value === 'synth') {
    player.setVoice(getActivePitchPipeVoice())
  }
}

const scrollPcOctave = ref(4)
const focusNote = ref(props.centerNote || 'C4')
const heldPcCodes = new Set<string>()

const pcKeyWindow = computed(() => pitchPipePcKeyWindowNotes(scrollPcOctave.value))
const pcKeyMap = computed(() => pitchPipePcKeyNoteMap(pcKeyWindow.value))
const pcKeyNoteSet = computed(() => new Set(pcKeyMap.value.values()))

const pcHint = computed(() => {
  const low = pcKeyMap.value.get('KeyS')
  const high = pcKeyMap.value.get('KeyL')
  if (!low || !high) return ''
  return `${low}–${high}`
})

function isOutOfPcWindow(note: string): boolean {
  return !pcKeyNoteSet.value.has(note)
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || t.isContentEditable
}

function onPcKeyDown(e: KeyboardEvent): void {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
  if (isTypingTarget(e.target)) return
  const note = pcKeyMap.value.get(e.code)
  if (!note) return
  e.preventDefault()
  e.stopPropagation()
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

function onWindowBlur(): void {
  heldPcCodes.clear()
  player.allNotesOff(true)
  syncSounding()
}

function syncScrollPcOctave(): void {
  const scroller = pianoHScrollRef.value?.getScrollElement()
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
  focusNote.value = bestNote
  scrollPcOctave.value = pitchPipePcKeyOctave([bestNote])
  if (pianoEngine.value === 'samples') {
    void player.preloadForNote?.(bestNote).catch(() => undefined)
  }
}

function nudgeScale(delta: number): void {
  prefs.nudgeSheetPianoKeyScale(delta)
  void nextTick(() => {
    emit('resize')
    centerOn(focusNote.value || props.centerNote || 'C4', false)
  })
}

function centerOn(note: string, smooth = false): void {
  focusNote.value = note
  void nextTick(() => {
    pianoHScrollRef.value?.scrollToNote(note, {
      behavior: smooth ? 'smooth' : 'instant',
    })
    syncScrollPcOctave()
    pianoHScrollRef.value?.syncThumb()
  })
}

/** Viewport width / orientation changed — keep key size, reflow visible count + focus band. */
function onViewportChange(): void {
  void nextTick(() => {
    emit('resize')
    centerOn(focusNote.value || props.centerNote || 'C4', false)
  })
}

let resizeRo: ResizeObserver | null = null
let lastViewportWidth = 0

onMounted(() => {
  window.addEventListener('keydown', onPcKeyDown, true)
  window.addEventListener('keyup', onPcKeyUp, true)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener(PITCH_PIPE_VOICE_CHANGE_EVENT, syncPitchVoice)
  window.addEventListener('orientationchange', onViewportChange)
  lastViewportWidth = window.innerWidth
  if (pianoEngine.value === 'samples') {
    void player.preloadForNote?.(props.centerNote || 'C4').catch(() => {
      sampleStatus.value = player.getLoadError?.() ?? 'Couldn’t load piano samples'
    })
  }
  centerOn(props.centerNote || 'C4')
  void nextTick(() => emit('resize'))
  if (shellRef.value && typeof ResizeObserver !== 'undefined') {
    resizeRo = new ResizeObserver(() => {
      const w = window.innerWidth
      // Ignore height-only keyboard chrome jitter; react to width / rotation.
      if (Math.abs(w - lastViewportWidth) < 2) {
        emit('resize')
        pianoHScrollRef.value?.syncThumb()
        return
      }
      lastViewportWidth = w
      onViewportChange()
    })
    resizeRo.observe(shellRef.value)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onPcKeyDown, true)
  window.removeEventListener('keyup', onPcKeyUp, true)
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener(PITCH_PIPE_VOICE_CHANGE_EVENT, syncPitchVoice)
  window.removeEventListener('orientationchange', onViewportChange)
  resizeRo?.disconnect()
  resizeRo = null
  heldPcCodes.clear()
  setSessionBusy('sheet-piano', false)
  player.dispose()
})

watch(
  () => props.centerNote,
  (n) => {
    if (n) centerOn(n)
  },
)
</script>

<template>
  <div ref="shellRef" class="sheet-piano-dock" role="region" aria-label="Pitch piano">
    <div class="dock-chrome">
      <div class="dock-title">
        <span class="dock-label">Piano</span>
        <span v-if="pcHint" class="dock-hint">{{ pcHint }} · drag to pan</span>
        <span v-if="sampleStatus" class="dock-err">{{ sampleStatus }}</span>
      </div>
      <div class="dock-scale" role="group" aria-label="Piano zoom">
        <button
          type="button"
          class="dock-btn"
          :disabled="keyScale <= SHEET_PIANO_SCALE_MIN"
          aria-label="Show more keys"
          title="Show more keys"
          @click="nudgeScale(-SHEET_PIANO_SCALE_STEP)"
        >
          −
        </button>
        <span class="dock-scale-val" aria-live="polite">{{ keyScale }}%</span>
        <button
          type="button"
          class="dock-btn"
          :disabled="keyScale >= SHEET_PIANO_SCALE_MAX"
          aria-label="Show fewer keys"
          title="Show fewer keys"
          @click="nudgeScale(SHEET_PIANO_SCALE_STEP)"
        >
          +
        </button>
      </div>
      <button
        type="button"
        class="dock-btn dock-close"
        aria-label="Close piano"
        title="Close piano"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>

    <PianoHorizontalScroll
      ref="pianoHScrollRef"
      @note-on="noteOn"
      @note-off="noteOff"
      @scroll="syncScrollPcOctave"
    >
      <div
        class="piano piano-h piano-stubby"
        :style="{
          '--white-count': displayWhites.length,
          '--white-w': `${whiteKeyPx}px`,
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
          >
            <span class="note-single"
              >{{ byNote.get(note)?.display.sharp
              }}{{ octaveLabel(byNote.get(note)?.display.octave ?? '') }}</span
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
          >
            <span class="note-dual">
              <span class="note-sharp"
                >{{ byNote.get(b.note)?.display.sharp
                }}{{ octaveLabel(byNote.get(b.note)?.display.octave ?? '') }}</span
              >
            </span>
          </button>
        </div>
      </div>
    </PianoHorizontalScroll>
  </div>
</template>

<style scoped>
.sheet-piano-dock {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  width: 100%;
  background: color-mix(in srgb, #111 92%, var(--surface, #222));
  border-top: 1px solid color-mix(in srgb, #fff 14%, transparent);
  padding: 0.3rem 0 calc(0.25rem + env(safe-area-inset-bottom));
  z-index: 70;
  user-select: none;
  -webkit-user-select: none;
}
.dock-chrome {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0 0.45rem;
  min-height: 1.75rem;
}
.dock-title {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
  min-width: 0;
  flex: 1 1 auto;
}
.dock-label {
  font-weight: 750;
  font-size: 0.82rem;
  color: #fff;
}
.dock-hint {
  font-size: 0.72rem;
  color: color-mix(in srgb, #fff 55%, transparent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dock-err {
  font-size: 0.72rem;
  color: #fca5a5;
  font-weight: 600;
}
.dock-scale {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  flex: 0 0 auto;
}
.dock-scale-val {
  min-width: 2.75rem;
  text-align: center;
  font-size: 0.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: color-mix(in srgb, #fff 80%, transparent);
}
.dock-btn {
  min-width: 1.85rem;
  min-height: 1.85rem;
  padding: 0 0.35rem;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, #fff 22%, transparent);
  background: color-mix(in srgb, #000 35%, transparent);
  color: #fff;
  font: inherit;
  font-weight: 700;
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
  touch-action: manipulation;
}
.dock-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.dock-close {
  flex: 0 0 auto;
}
.piano {
  --white-count: 8;
  --white-w: 51px;
  position: relative;
  width: max-content;
  border: 0;
  background: color-mix(in srgb, #000 40%, #333);
}
.piano-stubby {
  height: 5.85rem;
}
.piano-whites {
  display: flex;
  flex-direction: row;
  height: 100%;
  width: calc(var(--white-count) * var(--white-w));
}
.piano-whites .note {
  flex: 0 0 var(--white-w);
  width: var(--white-w);
  min-width: var(--white-w);
  height: 100%;
  min-height: 0;
  border-radius: 0;
  border-width: 0 1px 0 0;
  border-style: solid;
  border-color: color-mix(in srgb, #000 35%, transparent);
  justify-content: flex-end;
  align-items: flex-end;
  padding: 0.28rem 0.15rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  touch-action: none;
  display: flex;
  text-align: center;
  color: #1a1a1a;
  background: color-mix(in srgb, #fff 92%, #ddd);
}
.piano-whites .note:last-child {
  border-right: 0;
}
.piano-blacks {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.piano-blacks .note {
  pointer-events: auto;
  position: absolute;
  top: 0;
  width: calc(var(--white-w) * 0.62);
  height: 58%;
  min-height: 0;
  transform: translateX(-50%);
  border-radius: 0 0 6px 6px;
  border: 1px solid #000;
  background: #1c1c1c;
  color: #f2f2f2;
  z-index: 2;
  padding: 0.18rem 0.1rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  touch-action: none;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  box-shadow: 0 1px 3px rgb(0 0 0 / 35%);
}
.note-single {
  font-size: clamp(0.6rem, 1.7vw, 0.85rem);
  line-height: 1.05;
}
.note-dual {
  font-size: clamp(0.52rem, 1.4vw, 0.72rem);
  line-height: 1.05;
}
.note.active {
  outline: 2px solid var(--accent, #3b82f6);
  outline-offset: -1px;
  background: var(--accent, #3b82f6) !important;
  color: #fff !important;
  border-color: var(--accent, #3b82f6);
}
/* Opaque muted fills — opacity would show accent through overlapping black keys. */
.piano-whites .note.out-of-range {
  background: color-mix(in srgb, #fff 55%, #9a9a9a);
  color: color-mix(in srgb, #1a1a1a 40%, #888);
}
.piano-blacks .note.out-of-range {
  background: color-mix(in srgb, #1c1c1c 55%, #6a6a6a);
  color: color-mix(in srgb, #f2f2f2 35%, #888);
  border-color: color-mix(in srgb, #000 50%, #666);
  box-shadow: none;
}
.note.out-of-range.active {
  background: var(--accent, #3b82f6) !important;
  color: #fff !important;
  border-color: var(--accent, #3b82f6);
}
</style>
