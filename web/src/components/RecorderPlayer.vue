<script setup lang="ts">
/**
 * Single-take player for Labs Audio Recorder: waveform, A–B loop, pitch/speed,
 * solo/balance, and crop-to-selection (destructive replace with one-step undo).
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { TagAudioPlayer, type SoloMode } from '../audio/player'
import {
  clampPitchSemitones,
  formatKeyShiftLabel,
  MIN_PITCH_SEMITONES,
  MAX_PITCH_SEMITONES,
} from '../audio/pitchPlayer'
import { peaksFromAudioBuffer, syntheticPeaks } from '../audio/waveform'
import { cropTakeBytesToWav } from '../audio/cropAudioBuffer'
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
}>()

const emit = defineEmits<{
  cropped: [take: RecorderTake]
}>()

const recorder = useRecorderStore()
const player = new TagAudioPlayer()
const tick = ref(0)
const peaks = ref<number[]>([])
const waveLoading = ref(false)
const err = ref<string | null>(null)
const pitch = ref(0)
const speed = ref(1)
const solo = ref<SoloMode>('stereo')
const balance = ref(0)
const loop = ref(false)
const markA = ref(0)
const markB = ref(0)
const cropping = ref(false)
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
const monoSolo = computed(() => {
  void tick.value
  return player.effectivelyMono
})
const mixBaking = computed(() => {
  void tick.value
  return player.baking
})
const bakeError = computed(() => {
  void tick.value
  return player.bakeError
})
const pitchLabel = computed(() => formatKeyShiftLabel(null, pitch.value))
const balanceLabel = computed(() => {
  const b = balance.value
  if (Math.abs(b) < 0.02) return 'Center'
  if (b < 0) return `L +${Math.round(-b * 100)}%`
  return `R +${Math.round(b * 100)}%`
})

const canCrop = computed(() => {
  const d = duration.value
  if (d <= 0 || waveLoading.value || cropping.value) return false
  const gap = markB.value - markA.value
  const min = minLoopGapSec(d)
  if (gap < min) return false
  // Not already full duration (within 20ms).
  return markA.value > 0.02 || markB.value < d - 0.02
})

const canUndoCrop = computed(
  () => recorder.cropUndo?.takeId === props.take.id,
)

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

async function loadTake(): Promise<void> {
  const seq = ++loadSeq
  waveLoading.value = true
  err.value = null
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = null
  }
  try {
    const url = await recorder.takeObjectUrl(props.take.id)
    if (!url) throw new Error('Missing take audio')
    if (seq !== loadSeq) {
      URL.revokeObjectURL(url)
      return
    }
    objectUrl.value = url
    await player.load(url, 'stereo')
    if (seq !== loadSeq) {
      URL.revokeObjectURL(url)
      if (objectUrl.value === url) objectUrl.value = null
      return
    }
    await player.setTransform(pitch.value, speed.value)
    await player.setSolo(solo.value)
    await player.setBalance(balance.value)
    player.setLoop(false)
    const d = player.duration
    syncLoopMarks(d)
    const buf = player.getOriginalBuffer?.() ?? null
    peaks.value = buf ? peaksFromAudioBuffer(buf, 800) : syntheticPeaks(800, props.take.id)
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

async function togglePlay(): Promise<void> {
  if (player.paused) {
    seekToRegionStartIfNeeded()
    await player.play()
  } else {
    player.pause()
  }
  tick.value++
}

function stopPlayback(): void {
  player.pause()
  player.seek(regionActive() ? markA.value : 0)
  tick.value++
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

async function cropToSelection(): Promise<void> {
  if (!canCrop.value) return
  if (
    !confirm(
      'Replace this take with the selected region?\n\nOne undo is saved on this device until you crop again or delete the take.',
    )
  ) {
    return
  }
  cropping.value = true
  err.value = null
  try {
    const bytes = await recorder.takeBytes(props.take.id)
    if (!bytes) throw new Error('Missing take audio')
    const cropped = await cropTakeBytesToWav(bytes.data, markA.value, markB.value)
    const copy = new Uint8Array(cropped.bytes.byteLength)
    copy.set(cropped.bytes)
    const next = await recorder.replaceTakeAudio({
      takeId: props.take.id,
      data: copy.buffer,
      mime: 'audio/wav',
      durationSec: cropped.durationSec,
      sampleRate: cropped.sampleRate,
      channels: cropped.channels === 2 ? 2 : 1,
      keepUndo: true,
    })
    if (next) emit('cropped', next)
    await loadTake()
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e)
  } finally {
    cropping.value = false
  }
}

async function undoCrop(): Promise<void> {
  if (!canUndoCrop.value) return
  cropping.value = true
  err.value = null
  try {
    const next = await recorder.undoLastCrop()
    if (next) emit('cropped', next)
    await loadTake()
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e)
  } finally {
    cropping.value = false
  }
}

watch(
  () => props.take.id,
  () => {
    pitch.value = 0
    speed.value = 1
    solo.value = 'stereo'
    balance.value = 0
    loop.value = false
    void loadTake()
  },
)

watch(pitch, (v) => void player.setTransform(v, speed.value).then(() => tick.value++))
watch(speed, (v) => void player.setTransform(pitch.value, v).then(() => tick.value++))
watch(solo, (v) => {
  void player.setSolo(v).then(() => tick.value++)
  if (v !== 'stereo') balance.value = 0
})
watch(balance, (v) => void player.setBalance(v).then(() => tick.value++))

onMounted(() => {
  player.setUpdateListener(() => {
    tick.value++
    maybeEnforceRegionEnd()
  })
  player.setEndedListener(() => {
    if (loop.value && regionActive()) {
      player.seek(markA.value)
      void player.play()
    }
    tick.value++
  })
  regionTimer = setInterval(() => maybeEnforceRegionEnd(), 50)
  void loadTake()
})

onUnmounted(() => {
  if (regionTimer) clearInterval(regionTimer)
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
        :interactive="!waveLoading && duration > 0"
        @seek="onSeek"
        @update:mark-a="onMarkA"
        @update:mark-b="onMarkB"
      />
      <span v-if="waveLoading" class="visually-hidden" role="status">Loading waveform…</span>
    </div>

    <div class="transport" :class="{ muted: waveLoading || duration <= 0 }">
      <button
        type="button"
        class="btn primary"
        :aria-label="paused ? 'Play' : 'Pause'"
        :disabled="waveLoading || duration <= 0"
        @click="togglePlay"
      >
        {{ paused ? '▶' : '⏸' }}
      </button>
      <button type="button" class="btn" aria-label="Stop" :disabled="waveLoading" @click="stopPlayback">
        ■
      </button>
      <button type="button" class="btn" aria-label="Back 1 second" :disabled="waveLoading" @click="nudge(-1)">
        −1s
      </button>
      <button type="button" class="btn" aria-label="Forward 1 second" :disabled="waveLoading" @click="nudge(1)">
        +1s
      </button>
      <select v-model.number="speed" aria-label="Playback speed" :disabled="waveLoading || mixBaking">
        <option v-for="opt in SPEED_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
      <span class="time">{{ fmt(currentTime) }} / {{ fmt(duration) }}</span>
    </div>

    <p class="hint">
      Drag brackets to set the play region. Crop replaces this take with the selection (one undo kept on device).
    </p>

    <div class="crop-row">
      <button type="button" class="btn" :disabled="!canCrop" @click="cropToSelection">
        {{ cropping ? 'Cropping…' : 'Crop to selection' }}
      </button>
      <button type="button" class="btn secondary" :disabled="!canUndoCrop || cropping" @click="undoCrop">
        Undo crop
      </button>
    </div>

    <details class="advanced">
      <summary>Advanced</summary>
      <div class="adv-grid">
        <div class="field">
          <span class="lbl">Loop</span>
          <button type="button" class="btn" :aria-pressed="loop" @click="loop = !loop">
            {{ loop ? 'On' : 'Off' }}
          </button>
        </div>
        <div class="field">
          <span class="lbl">Pitch <strong>{{ pitchLabel }}</strong></span>
          <div class="row">
            <button
              type="button"
              class="btn"
              :disabled="pitch <= MIN_PITCH_SEMITONES || mixBaking"
              @click="bumpPitch(-1)"
            >
              −
            </button>
            <button
              type="button"
              class="btn"
              :disabled="pitch >= MAX_PITCH_SEMITONES || mixBaking"
              @click="bumpPitch(1)"
            >
              +
            </button>
            <button type="button" class="btn" :disabled="!pitch || mixBaking" @click="pitch = 0">Reset</button>
          </div>
        </div>
        <div class="field" role="group" aria-label="Channel solo">
          <span class="lbl">Solo</span>
          <div class="seg">
            <button type="button" :aria-pressed="solo === 'stereo'" :disabled="monoSolo" @click="solo = 'stereo'">
              Stereo
            </button>
            <button type="button" :aria-pressed="solo === 'left'" :disabled="monoSolo" @click="solo = 'left'">
              Left
            </button>
            <button type="button" :aria-pressed="solo === 'right'" :disabled="monoSolo" @click="solo = 'right'">
              Right
            </button>
          </div>
        </div>
        <label class="field">
          <span class="lbl">Balance <strong>{{ balanceLabel }}</strong></span>
          <input
            v-model.number="balance"
            type="range"
            min="-1"
            max="1"
            step="0.01"
            :disabled="solo !== 'stereo'"
            aria-label="Stereo balance"
          />
        </label>
      </div>
      <p v-if="bakeError" class="warn" role="alert">{{ bakeError }}</p>
    </details>
  </div>
</template>

<style scoped>
.recorder-player {
  display: grid;
  gap: 0.75rem;
  min-width: 0;
}
.wave-wrap {
  min-width: 0;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--surface);
}
.transport {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}
.transport.muted,
.field:has(:disabled) {
  opacity: 0.7;
}
.btn {
  min-height: 40px;
  padding: 0.35rem 0.7rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  color: inherit;
}
.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.btn.secondary {
  background: var(--surface);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.time {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  font-size: 0.9rem;
}
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
  line-height: 1.4;
}
.crop-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.advanced > summary {
  cursor: pointer;
  font-weight: 600;
  padding: 0.35rem 0;
}
.adv-grid {
  display: grid;
  gap: 0.75rem;
  padding-top: 0.5rem;
}
.field {
  display: grid;
  gap: 0.35rem;
}
.lbl {
  font-size: 0.85rem;
  color: var(--muted);
}
.row,
.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.seg button {
  flex: 1 1 auto;
  min-height: 40px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.seg button[aria-pressed='true'] {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
}
.error {
  margin: 0;
  color: var(--danger);
}
.warn {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
select {
  font: inherit;
  min-height: 40px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  padding: 0.25rem 0.5rem;
}
input[type='range'] {
  width: 100%;
  accent-color: var(--accent);
}
</style>
