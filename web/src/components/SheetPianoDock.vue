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
  SHEET_PIANO_HEIGHT_DEFAULT_PX,
  SHEET_PIANO_HEIGHT_TALL_PX,
  SHEET_PIANO_SCALE_MAX,
  SHEET_PIANO_SCALE_MIN,
  SHEET_PIANO_SCALE_STEP,
  clampSheetPianoHeightPx,
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
const pianoHeightPx = computed(() => prefs.sheetPianoHeightPx)
const pianoEngine = computed(() => prefs.pitchPipePianoEngine)
const pianoLockPosition = computed(() => prefs.pitchPipePianoLockPosition)
const showPcKeyRange = computed(() => prefs.pitchPipeShowPcKeyRange)

function togglePianoLock(): void {
  prefs.setPitchPipePianoLockPosition(!pianoLockPosition.value)
}

/** True when the dock is at (or above) the tall snap — toggle goes compact. */
const pianoExpanded = computed(
  () => pianoHeightPx.value >= (SHEET_PIANO_HEIGHT_DEFAULT_PX + SHEET_PIANO_HEIGHT_TALL_PX) / 2,
)

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

/** Which sides of each white key sit under a black key (for press-fill clip). */
const whiteKeyCuts = computed(() => {
  const whites = displayWhites.value
  const afterSet = new Set(pianoSlots.value.blacks.map((b) => b.after))
  const map = new Map<string, { left: boolean; right: boolean }>()
  for (let i = 0; i < whites.length; i++) {
    const note = whites[i]!
    map.set(note, {
      left: i > 0 && afterSet.has(whites[i - 1]!),
      right: afterSet.has(note),
    })
  }
  return map
})

function blackLeftPct(after: string): number {
  const idx = displayWhites.value.indexOf(after)
  if (idx < 0) return 0
  return (idx + 1) * whiteKeyPct.value
}

function octaveLabel(octave: string): string {
  return showOctave.value ? octave : ''
}

/** Guards async noteOn completing after noteOff (touch pan / multitouch). */
const wantSounding = new Set<string>()
const heldPcCodes = new Set<string>()

function rebuildPlayer(): void {
  wantSounding.clear()
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
  wantSounding.add(note)
  try {
    await player.noteOn(note, detune.value)
    sampleStatus.value = null
  } catch {
    sampleStatus.value = player.getLoadError?.() ?? 'Couldn’t play note'
  }
  if (!wantSounding.has(note)) {
    player.noteOff(note, true)
  }
  syncSounding()
}

function noteOff(note: string): void {
  wantSounding.delete(note)
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

const pcKeyWindow = computed(() => pitchPipePcKeyWindowNotes(scrollPcOctave.value))
const pcKeyMap = computed(() => pitchPipePcKeyNoteMap(pcKeyWindow.value))
const pcKeyNoteSet = computed(() => new Set(pcKeyMap.value.values()))

const pcHint = computed(() => {
  if (!showPcKeyRange.value) return ''
  const low = pcKeyMap.value.get('KeyS')
  const high = pcKeyMap.value.get('KeyL')
  if (!low || !high) return ''
  return `${low}–${high}`
})

function isOutOfPcWindow(note: string): boolean {
  return showPcKeyRange.value && !pcKeyNoteSet.value.has(note)
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
  wantSounding.clear()
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
    if (pianoLockPosition.value) return
    centerOn(focusNote.value || props.centerNote || 'C4', false)
  })
}

function setPianoHeight(px: number): void {
  prefs.setSheetPianoHeightPx(clampSheetPianoHeightPx(px))
  void nextTick(() => emit('resize'))
}

function togglePianoHeight(): void {
  setPianoHeight(
    pianoExpanded.value ? SHEET_PIANO_HEIGHT_DEFAULT_PX : SHEET_PIANO_HEIGHT_TALL_PX,
  )
}

/** Drag the top handle to resize key-strip height (drag up = taller). */
let heightDrag: { pointerId: number; startY: number; startH: number } | null = null

function onHeightHandleDown(e: PointerEvent): void {
  if (e.button !== 0 && e.pointerType === 'mouse') return
  e.preventDefault()
  e.stopPropagation()
  heightDrag = {
    pointerId: e.pointerId,
    startY: e.clientY,
    startH: pianoHeightPx.value,
  }
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
}

function onHeightHandleMove(e: PointerEvent): void {
  if (!heightDrag || e.pointerId !== heightDrag.pointerId) return
  // Dock sits at the bottom — dragging the handle up increases height.
  const next = heightDrag.startH + (heightDrag.startY - e.clientY)
  prefs.setSheetPianoHeightPx(clampSheetPianoHeightPx(next))
}

function onHeightHandleUp(e: PointerEvent): void {
  if (!heightDrag || e.pointerId !== heightDrag.pointerId) return
  heightDrag = null
  emit('resize')
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
  <div
    ref="shellRef"
    class="sheet-piano-dock"
    role="region"
    aria-label="Pitch piano"
    :style="{ '--piano-h': `${pianoHeightPx}px` }"
  >
    <div class="dock-chrome">
      <button
        type="button"
        class="dock-btn dock-lock"
        :class="{ 'is-on': pianoLockPosition }"
        :aria-pressed="pianoLockPosition"
        :aria-label="pianoLockPosition ? 'Unlock piano position' : 'Lock piano position'"
        :title="
          pianoLockPosition
            ? 'Unlock — drag keys to change octave'
            : 'Lock position — keep octave fixed'
        "
        @click="togglePianoLock"
      >
        {{ pianoLockPosition ? 'Locked' : 'Lock' }}
      </button>
      <div class="dock-title">
        <span class="dock-label">Piano</span>
        <span v-if="pcHint" class="dock-hint"
          >{{ pcHint }}<template v-if="!pianoLockPosition"> · drag to pan</template></span
        >
        <span v-if="sampleStatus" class="dock-err">{{ sampleStatus }}</span>
      </div>
      <button
        type="button"
        class="dock-height-handle"
        aria-label="Drag to resize piano height"
        title="Drag up to make the piano taller"
        @pointerdown="onHeightHandleDown"
        @pointermove="onHeightHandleMove"
        @pointerup="onHeightHandleUp"
        @pointercancel="onHeightHandleUp"
      >
        <span class="dock-height-grip" aria-hidden="true" />
      </button>
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
        class="dock-btn dock-height-toggle"
        :class="{ 'is-on': pianoExpanded }"
        :aria-pressed="pianoExpanded"
        :aria-label="pianoExpanded ? 'Compact piano height' : 'Expand piano height'"
        :title="pianoExpanded ? 'Compact piano' : 'Expand piano'"
        @click="togglePianoHeight"
      >
        {{ pianoExpanded ? '▾' : '▴' }}
      </button>
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
      :lock-position="pianoLockPosition"
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
              'cut-left': whiteKeyCuts.get(note)?.left,
              'cut-right': whiteKeyCuts.get(note)?.right,
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
              <span class="note-flat"
                >{{ byNote.get(b.note)?.display.flat
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
  --piano-h: 94px;
}
.dock-chrome {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0 0.45rem;
  min-height: 1.75rem;
}
/* Same centered pill as before, but overlaid on the button row (no extra strip). */
.dock-height-handle {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.5rem;
  height: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: ns-resize;
  touch-action: none;
  color: inherit;
}
.dock-height-grip {
  display: block;
  width: 2.75rem;
  height: 0.22rem;
  border-radius: 999px;
  background: color-mix(in srgb, #fff 38%, transparent);
}
.dock-height-handle:focus-visible {
  outline: 2px solid var(--accent, #3b82f6);
  outline-offset: -2px;
}
.dock-height-handle:active .dock-height-grip {
  background: color-mix(in srgb, #fff 62%, transparent);
}
.dock-title {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
  min-width: 0;
  flex: 1 1 auto;
  /* Leave the centered grip clear of label/hint text. */
  padding-right: 3.75rem;
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
  position: relative;
  z-index: 2;
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
.dock-height-toggle.is-on {
  border-color: color-mix(in srgb, var(--accent, #3b82f6) 70%, #fff);
  color: color-mix(in srgb, var(--accent, #3b82f6) 55%, #fff);
}
.dock-lock {
  position: relative;
  z-index: 2;
  flex: 0 0 auto;
  min-width: 3.4rem;
  font-size: 0.72rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.dock-lock.is-on {
  border-color: color-mix(in srgb, var(--accent, #3b82f6) 70%, #fff);
  background: color-mix(in srgb, var(--accent, #3b82f6) 35%, #000);
  color: color-mix(in srgb, var(--accent, #3b82f6) 40%, #fff);
}
.dock-height-toggle,
.dock-close {
  position: relative;
  z-index: 2;
  flex: 0 0 auto;
}
.piano {
  --white-count: 8;
  --white-w: 51px;
  /* Black key geometry relative to one white key (must match .piano-blacks .note). */
  --black-w-frac: 0.62;
  --black-h-frac: 58%;
  --black-half: 31%;
  position: relative;
  isolation: isolate;
  width: max-content;
  border: 0;
  background: color-mix(in srgb, #000 40%, #333);
}
.piano-stubby {
  height: var(--piano-h, 94px);
  min-height: 64px;
  max-height: min(320px, 45vh);
}
.piano-whites {
  display: flex;
  flex-direction: row;
  height: 100%;
  width: calc(var(--white-count) * var(--white-w));
  position: relative;
  z-index: 0;
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
  position: relative;
  z-index: 0;
}
/* Notch white keys where black keys sit so press fill matches the visible key. */
.piano-whites .note.cut-right:not(.cut-left) {
  clip-path: polygon(
    0 0,
    calc(100% - var(--black-half)) 0,
    calc(100% - var(--black-half)) var(--black-h-frac),
    100% var(--black-h-frac),
    100% 100%,
    0 100%
  );
}
.piano-whites .note.cut-left:not(.cut-right) {
  clip-path: polygon(
    var(--black-half) 0,
    100% 0,
    100% 100%,
    0 100%,
    0 var(--black-h-frac),
    var(--black-half) var(--black-h-frac)
  );
}
.piano-whites .note.cut-left.cut-right {
  clip-path: polygon(
    var(--black-half) 0,
    calc(100% - var(--black-half)) 0,
    calc(100% - var(--black-half)) var(--black-h-frac),
    100% var(--black-h-frac),
    100% 100%,
    0 100%,
    0 var(--black-h-frac),
    var(--black-half) var(--black-h-frac)
  );
}
.piano-whites .note:last-child {
  border-right: 0;
}
.piano-blacks {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}
.piano-blacks .note {
  pointer-events: auto;
  position: absolute;
  top: 0;
  width: calc(var(--white-w) * var(--black-w-frac));
  height: var(--black-h-frac);
  min-height: 0;
  transform: translateX(-50%);
  border-radius: 0 0 6px 6px;
  border: 1px solid #000;
  /* Fully opaque — white-key accent must never wash through. */
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
  overflow: hidden;
}
.note-single {
  /* Prefer stubby-dock size at 100%; shrink with key width below that. */
  font-size: min(0.85rem, calc(var(--white-w) * 0.34));
  line-height: 1.05;
  max-width: 100%;
  overflow: hidden;
}
.note-dual {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 0.02rem;
  width: 100%;
  font-size: min(0.72rem, calc(var(--white-w) * 0.26));
  line-height: 1.05;
  max-width: 100%;
  overflow: hidden;
}
.note.active {
  outline: none;
  background: var(--accent, #0f6b5c) !important;
  color: var(--on-accent, #fff) !important;
  border-color: var(--accent, #0f6b5c);
}
.piano-whites .note.active {
  /* Keep greens under the black layer; clip-path shapes the fill. */
  z-index: 0;
  box-shadow: inset 0 0 0 2px color-mix(in srgb, #fff 40%, var(--accent, #0f6b5c));
}
.piano-blacks .note.active {
  z-index: 3;
  background: var(--accent, #0f6b5c) !important;
  border-color: color-mix(in srgb, #000 55%, var(--accent, #0f6b5c));
  /* Inset ring follows border-radius; keep drop shadow neutral (not green). */
  box-shadow:
    inset 0 0 0 2px color-mix(in srgb, #fff 28%, var(--accent, #0f6b5c)),
    0 1px 3px rgb(0 0 0 / 35%);
}
.note:focus,
.note:focus-visible {
  outline: none;
}
.note:focus-visible:not(.active) {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent, #0f6b5c) 70%, #fff);
}
.piano-blacks .note:focus-visible:not(.active) {
  box-shadow:
    inset 0 0 0 2px color-mix(in srgb, var(--accent, #0f6b5c) 70%, #fff),
    0 1px 3px rgb(0 0 0 / 35%);
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
  background: var(--accent, #0f6b5c) !important;
  color: var(--on-accent, #fff) !important;
  border-color: var(--accent, #0f6b5c);
}
</style>
