<script setup lang="ts">
/**
 * Playback-mode take player: TagPlayer-style transport + ⋮ (loop/pitch/speed).
 * Capture lives in the session Record panel.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { TagAudioPlayer } from '../audio/player'
import { clampPitchSemitones, formatRelativePitchLabel, MIN_PITCH_SEMITONES, MAX_PITCH_SEMITONES } from '../audio/pitchPlayer'
import { peaksFromAudioBuffer, syntheticPeaks } from '../audio/waveform'
import {
  bytesForTakeListen,
  compoundPlaybackTransform,
  normalizeRecorderTakeEdits,
} from '../audio/takeEdits'
import { clampMarkA, clampMarkB, minLoopGapSec } from '../lib/waveformLayout'
import { useRecorderStore } from '../stores/recorder'
import type { RecorderTake } from '../types/recorder'
import WaveformView from './WaveformView.vue'

const SPEED_OPTIONS = [
  { value: 0.25, label: '25%' },
  { value: 0.5, label: '50%' },
  { value: 0.75, label: '75%' },
  { value: 1, label: '100%' },
  { value: 1.25, label: '125%' },
  { value: 1.5, label: '150%' },
  { value: 2, label: '200%' },
] as const

const props = defineProps<{
  take: RecorderTake
  /** When true, mute transport (capture in progress). */
  recording?: boolean
}>()

const emit = defineEmits<{
  'playing-change': [playing: boolean]
}>()

const recorder = useRecorderStore()
const player = new TagAudioPlayer()
const tick = ref(0)
const peaks = ref<number[]>([])
const waveLoading = ref(false)
const err = ref<string | null>(null)
const pitch = ref(0)
const speed = ref(1)
const loop = ref(false)
const moreOpen = ref(false)
const markA = ref(0)
const markB = ref(0)
const objectUrl = ref<string | null>(null)
let loadSeq = 0
let regionTimer: ReturnType<typeof setInterval> | null = null

const paused = computed(() => {
  void tick.value
  return player.paused
})
const currentTime = computed(() => {
  void tick.value
  return player.currentTime
})
const duration = computed(() => {
  void tick.value
  return player.duration
})
const playbackReady = computed(() => !waveLoading.value && duration.value > 0 && !props.recording)

const pitchLabel = computed(() => formatRelativePitchLabel(pitch.value))

const savedEditsHint = computed(() => {
  const e = normalizeRecorderTakeEdits(props.take.edits)
  const bits: string[] = []
  if (e.pitchSemitones) bits.push(`${e.pitchSemitones > 0 ? '+' : ''}${e.pitchSemitones} st`)
  if (Math.abs(e.speed - 1) > 1e-6) bits.push(`${Math.round(e.speed * 100)}%`)
  if (e.normalize) bits.push('normalize')
  if (e.compress) bits.push(`${e.compress.mode} compress`)
  return bits.length ? `Saved edits: ${bits.join(' · ')}` : null
})

function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function syncLoopMarks(d: number): void {
  if (d <= 0) {
    markA.value = 0
    markB.value = 0
    return
  }
  markA.value = 0
  markB.value = d
}

function regionActive(): boolean {
  return markB.value - markA.value >= minLoopGapSec(duration.value)
}

function seekToRegionStartIfNeeded(): void {
  if (!regionActive()) return
  const t = player.currentTime
  if (t < markA.value - 0.02 || t >= markB.value - 0.02) {
    player.seek(markA.value)
  }
}

function maybeEnforceRegionEnd(): void {
  if (!regionActive() || player.paused) return
  if (player.currentTime >= markB.value - 0.03) {
    if (loop.value) {
      player.seek(markA.value)
      void player.play()
    } else {
      player.pause()
      player.seek(markB.value)
    }
    tick.value++
  }
}

function onMarkA(t: number): void {
  markA.value = clampMarkA(t, markB.value, duration.value)
}
function onMarkB(t: number): void {
  markB.value = clampMarkB(t, markA.value, duration.value)
}
function onSeek(t: number): void {
  let next = t
  if (regionActive()) {
    next = Math.max(markA.value, Math.min(markB.value, t))
  }
  player.seek(next)
  tick.value++
}

function effectiveTransform() {
  return compoundPlaybackTransform(props.take.edits, pitch.value, speed.value)
}

async function applyEffectiveTransform(): Promise<void> {
  const t = effectiveTransform()
  await player.setTransform(t.pitchSemitones, t.speed)
  tick.value++
}

async function loadTakeAudio(url: string, seq: number): Promise<void> {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = null
  }
  objectUrl.value = url
  await player.load(url, 'stereo')
  if (seq !== loadSeq) {
    URL.revokeObjectURL(url)
    if (objectUrl.value === url) objectUrl.value = null
    return
  }
  await applyEffectiveTransform()
  player.setLoop(false)
  const d = player.duration
  syncLoopMarks(d)
  const buf = player.getOriginalBuffer?.() ?? null
  peaks.value = buf ? peaksFromAudioBuffer(buf, 800) : syntheticPeaks(800, props.take.id)
}

async function loadTake(): Promise<void> {
  const seq = ++loadSeq
  waveLoading.value = true
  err.value = null
  try {
    const bytes = await recorder.takeBytes(props.take.id)
    if (!bytes) throw new Error('Missing take audio')
    if (seq !== loadSeq) return
    const listen = await bytesForTakeListen(bytes.data, props.take.edits)
    if (seq !== loadSeq) return
    const mime = listen.mime || bytes.mime
    const copy = new Uint8Array(listen.data.byteLength)
    copy.set(listen.data)
    const url = URL.createObjectURL(new Blob([copy], { type: mime || 'application/octet-stream' }))
    await loadTakeAudio(url, seq)
  } catch (e) {
    if (seq !== loadSeq) return
    err.value = e instanceof Error ? e.message : String(e)
    peaks.value = []
  } finally {
    if (seq === loadSeq) {
      waveLoading.value = false
      tick.value++
    }
  }
}

function emitPlaying(): void {
  emit('playing-change', !player.paused)
}

async function togglePlay(): Promise<void> {
  if (player.paused) {
    seekToRegionStartIfNeeded()
    await player.play()
  } else {
    player.pause()
  }
  tick.value++
  emitPlaying()
}

function stopPlayback(): void {
  player.pause()
  player.seek(regionActive() ? markA.value : 0)
  tick.value++
  emitPlaying()
}

function nudge(delta: number): void {
  let t = player.currentTime + delta
  if (regionActive()) t = Math.max(markA.value, Math.min(markB.value, t))
  else t = Math.max(0, Math.min(duration.value, t))
  player.seek(t)
  tick.value++
}

function bumpPitch(delta: number): void {
  pitch.value = clampPitchSemitones(pitch.value + delta)
}

watch(
  () => [props.take.id, props.take.edits, props.take.byteLength] as const,
  () => {
    pitch.value = 0
    speed.value = 1
    loop.value = false
    moreOpen.value = false
    void loadTake()
  },
)

watch(
  () => props.recording,
  (on) => {
    if (on && !player.paused) {
      player.pause()
      tick.value++
      emitPlaying()
    }
  },
)

watch([pitch, speed], () => void applyEffectiveTransform())

onMounted(() => {
  player.setUpdateListener(() => {
    tick.value++
    maybeEnforceRegionEnd()
  })
  player.setEndedListener(() => {
    if (loop.value && regionActive()) {
      player.seek(markA.value)
      void player.play().then(() => emitPlaying())
      tick.value++
      return
    }
    tick.value++
    emitPlaying()
  })
  regionTimer = setInterval(() => maybeEnforceRegionEnd(), 50)
  void loadTake()
})

onUnmounted(() => {
  if (regionTimer) clearInterval(regionTimer)
  emit('playing-change', false)
  player.dispose()
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
})
</script>

<template>
  <div class="recorder-player">
    <p v-if="err" class="error" role="alert">{{ err }}</p>
    <div class="wave-wrap">
      <WaveformView
        :peaks="peaks"
        :current-time="currentTime"
        :duration="duration"
        :mark-a="markA"
        :mark-b="markB"
        :interactive="playbackReady"
        @seek="onSeek"
        @update:mark-a="onMarkA"
        @update:mark-b="onMarkB"
      />
      <span v-if="waveLoading" class="visually-hidden" role="status">Loading waveform…</span>
    </div>

    <div class="ctrl-transport transport" :class="{ muted: !playbackReady }">
      <button
        type="button"
        class="ctrl-transport-btn ctrl-transport-btn--primary"
        :aria-label="paused ? 'Play' : 'Pause'"
        :disabled="!playbackReady"
        @click="togglePlay"
      >
        {{ paused ? '▶' : '⏸' }}
      </button>
      <button
        type="button"
        class="ctrl-transport-btn"
        aria-label="Stop — pause and go to start"
        title="Stop and go to start"
        :disabled="!playbackReady"
        @click="stopPlayback"
      >
        ■
      </button>
      <button
        type="button"
        class="ctrl-transport-btn"
        aria-label="Back 1 second"
        :disabled="!playbackReady"
        @click="nudge(-1)"
      >
        −1s
      </button>
      <button
        type="button"
        class="ctrl-transport-btn"
        aria-label="Forward 1 second"
        :disabled="!playbackReady"
        @click="nudge(1)"
      >
        +1s
      </button>
      <button
        type="button"
        class="ctrl-transport-btn more-btn"
        aria-label="Loop, pitch, and speed"
        title="Loop, pitch, and speed"
        :aria-expanded="moreOpen"
        aria-controls="recorder-playback-more"
        :disabled="!playbackReady"
        @click="moreOpen = !moreOpen"
      >
        ⋮
      </button>
      <span class="time">{{ fmt(currentTime) }} / {{ fmt(duration) }}</span>
    </div>

    <div
      v-if="moreOpen"
      id="recorder-playback-more"
      class="playback-adjust"
      :class="{ muted: !playbackReady }"
      role="group"
      aria-label="Loop, pitch, and speed"
    >
      <div class="adjust-row">
        <div class="ctrl-field loop-field">
          <span class="ctrl-field-label">Loop</span>
          <button
            type="button"
            class="ctrl-toggle"
            :aria-pressed="loop"
            :disabled="!playbackReady"
            @click="loop = !loop"
          >
            {{ loop ? 'On' : 'Off' }}
          </button>
        </div>
        <div class="ctrl-field pitch-field" role="group" aria-label="Pitch">
          <span class="ctrl-field-label">Pitch <strong>{{ pitchLabel }}</strong></span>
          <div class="pitch-btns">
            <button
              type="button"
              aria-label="Lower pitch one semitone"
              :disabled="!playbackReady || pitch <= MIN_PITCH_SEMITONES"
              @click="bumpPitch(-1)"
            >
              −
            </button>
            <button
              type="button"
              aria-label="Raise pitch one semitone"
              :disabled="!playbackReady || pitch >= MAX_PITCH_SEMITONES"
              @click="bumpPitch(1)"
            >
              +
            </button>
            <button type="button" :disabled="!playbackReady || !pitch" @click="pitch = 0">
              Reset
            </button>
          </div>
        </div>
        <div class="ctrl-field speed-field">
          <span class="ctrl-field-label">Speed</span>
          <select
            class="speed-select"
            v-model.number="speed"
            aria-label="Playback speed"
            :disabled="!playbackReady"
          >
            <option v-for="opt in SPEED_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <p class="hint ab-hint">
      Drag the side brackets to set the play region.
      <span v-if="savedEditsHint"> {{ savedEditsHint }} — temporary pitch/speed here stack on top for listening only.</span>
    </p>
  </div>
</template>

<style scoped>
.recorder-player {
  display: grid;
  gap: 0.75rem;
  min-width: 0;
}
.wave-wrap {
  position: relative;
  min-width: 0;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--surface);
}
.transport.ctrl-transport {
  display: flex;
  flex-wrap: nowrap;
  align-items: stretch;
  gap: clamp(0.2rem, 0.9vw, 0.4rem);
  width: 100%;
  min-width: 0;
}
.transport .ctrl-transport-btn {
  flex: 1 1 0;
  min-width: 0;
  max-width: none;
  width: auto;
  padding: clamp(0.28rem, 1.1vw, 0.4rem) clamp(0.1rem, 0.7vw, 0.35rem);
  font-size: clamp(0.78rem, 2.35vw, 0.95rem);
}
.transport .ctrl-transport-btn--primary {
  font-size: clamp(0.9rem, 2.8vw, 1.1rem);
}
.transport .time {
  flex: 0 0 auto;
  min-width: 5.5rem;
  margin: 0;
  margin-left: auto;
  align-self: center;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  font-size: clamp(0.75rem, 2.15vw, 0.9rem);
  white-space: nowrap;
}
.more-btn {
  flex: 0 0 auto !important;
  width: 2.75rem !important;
  max-width: 2.75rem !important;
  font-size: 1.35rem !important;
  line-height: 1;
  letter-spacing: 0.02em;
}
.more-btn[aria-expanded='true'] {
  border-color: var(--accent);
  color: var(--accent);
}
.hint.ab-hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
  line-height: 1.4;
}
.playback-adjust {
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0.55rem 0.15rem 0.15rem;
  border-top: 1px solid var(--border);
}
.adjust-row {
  display: grid;
  gap: 0.65rem 1rem;
  align-items: end;
}
@media (min-width: 520px) {
  .adjust-row {
    grid-template-columns: minmax(5rem, 0.45fr) minmax(0, 1fr) minmax(6rem, 0.55fr);
  }
}
.loop-field .ctrl-toggle {
  width: 100%;
  min-height: 44px;
}
.ctrl-field-label strong {
  color: var(--text);
  margin-left: 0.25rem;
  font-variant-numeric: tabular-nums;
}
.pitch-btns {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.35rem;
  min-width: 0;
}
.pitch-btns button {
  flex: 1 1 0;
  min-width: 0;
  min-height: 44px;
  padding: 0.35rem 0.45rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  color: inherit;
}
.pitch-btns button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.speed-select {
  width: 100%;
  min-height: 44px;
  box-sizing: border-box;
  padding: 0.35rem 0.5rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  font: inherit;
  font-weight: 600;
  font-size: 16px;
  color: inherit;
}
.speed-select:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.muted {
  opacity: 0.55;
  pointer-events: none;
}
.error {
  margin: 0;
  color: var(--danger);
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (min-width: 720px) {
  .transport .time {
    min-width: 6.25rem;
    margin-left: 0.25rem;
  }
}
</style>
