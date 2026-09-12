<script setup lang="ts">
/**
 * Take edit page: draft pitch/speed/normalize/compress + crop.
 * Save persists edits (and blob if cropped); Close discards draft.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { TagAudioPlayer } from '../audio/player'
import {
  clampPitchSemitones,
  formatRelativePitchLabel,
  MIN_PITCH_SEMITONES,
  MAX_PITCH_SEMITONES,
} from '../audio/pitchPlayer'
import { peaksFromAudioBuffer, syntheticPeaks } from '../audio/waveform'
import { cropTakeBytesToWav } from '../audio/cropAudioBuffer'
import { TAKE_COMPRESS_MODE_OPTIONS, type TakeCompressMode } from '../audio/takeLevelProcess'
import {
  bytesForTakeListen,
  defaultRecorderTakeEdits,
  normalizeRecorderTakeEdits,
  recorderTakeEditsEqual,
  takeEditsTransform,
  type RecorderTakeEdits,
} from '../audio/takeEdits'
import { clampMarkA, clampMarkB, minLoopGapSec } from '../lib/waveformLayout'
import { useRecorderStore } from '../stores/recorder'
import type { RecorderTake } from '../types/recorder'
import WaveformView from '../components/WaveformView.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const SPEED_OPTIONS = [
  { value: 0.25, label: '25%' },
  { value: 0.5, label: '50%' },
  { value: 0.75, label: '75%' },
  { value: 1, label: '100%' },
  { value: 1.25, label: '125%' },
  { value: 1.5, label: '150%' },
  { value: 2, label: '200%' },
] as const

type CompressSelect = 'off' | TakeCompressMode

const props = defineProps<{
  id: string
  takeId: string
}>()

const router = useRouter()
const store = useRecorderStore()
const player = new TagAudioPlayer()

const take = ref<RecorderTake | null>(null)
const err = ref<string | null>(null)
const msg = ref<string | null>(null)
const waveLoading = ref(false)
const peaks = ref<number[]>([])
const tick = ref(0)
const markA = ref(0)
const markB = ref(0)
const cropping = ref(false)
const processing = ref(false)
const saving = ref(false)

const draftEdits = ref<RecorderTakeEdits>(defaultRecorderTakeEdits())
const draftBytes = ref<Uint8Array | null>(null)
const draftMime = ref('audio/wav')
const draftDuration = ref(0)
const draftSampleRate = ref<number | null>(null)
const draftChannels = ref<1 | 2>(1)
const blobDirty = ref(false)

const savedEdits = ref<RecorderTakeEdits>(defaultRecorderTakeEdits())
const restoreConfirmOpen = ref(false)
const unsavedOpen = ref(false)
let unsavedResolve: ((ok: boolean) => void) | null = null
let unsavedPromise: Promise<boolean> | null = null
/** Skip the unsaved guard after an intentional discard/save navigation. */
let allowLeave = false

const objectUrl = ref<string | null>(null)
let loadSeq = 0
let previewTimer: ReturnType<typeof setTimeout> | null = null
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
const playbackReady = computed(() => !waveLoading.value && duration.value > 0)

const normalizeOn = computed({
  get: () => draftEdits.value.normalize,
  set(v: boolean) {
    draftEdits.value = { ...draftEdits.value, normalize: v }
  },
})

const compressMode = computed({
  get(): CompressSelect {
    return draftEdits.value.compress?.mode ?? 'off'
  },
  set(v: CompressSelect) {
    if (v === 'off') {
      draftEdits.value = { ...draftEdits.value, compress: null }
    } else {
      draftEdits.value = {
        ...draftEdits.value,
        compress: {
          mode: v,
          intensity: draftEdits.value.compress?.intensity ?? 0.5,
        },
      }
    }
  },
})

const compressIntensity = computed({
  get: () => draftEdits.value.compress?.intensity ?? 0.5,
  set(v: number) {
    if (!draftEdits.value.compress) return
    draftEdits.value = {
      ...draftEdits.value,
      compress: { ...draftEdits.value.compress, intensity: v },
    }
  },
})

const pitchLabel = computed(() => formatRelativePitchLabel(draftEdits.value.pitchSemitones))

const intensityLabel = computed(() => {
  const t = compressIntensity.value
  if (t <= 0.2) return 'Light'
  if (t >= 0.8) return 'Heavy'
  if (t >= 0.4 && t <= 0.6) return 'Medium'
  return `${Math.round(t * 100)}%`
})

const compressHint = computed(() => {
  if (compressMode.value === 'off') {
    return 'Runs after normalize when both are on. Previews while you listen; baked on export when saved.'
  }
  return TAKE_COMPRESS_MODE_OPTIONS.find((m) => m.value === compressMode.value)?.hint ?? ''
})

const dirty = computed(() => {
  return blobDirty.value || !recorderTakeEditsEqual(draftEdits.value, savedEdits.value)
})

const canCrop = computed(() => {
  const d = duration.value
  if (d <= 0 || waveLoading.value || cropping.value || processing.value) return false
  const gap = markB.value - markA.value
  const min = minLoopGapSec(d)
  if (gap < min) return false
  return markA.value > 0.02 || markB.value < d - 0.02
})

const modifiedVsOriginal = ref(false)

function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function syncLoopMarks(d: number): void {
  markA.value = 0
  markB.value = d > 0 ? d : 0
}

function regionActive(): boolean {
  return markB.value - markA.value >= minLoopGapSec(duration.value)
}

function maybeEnforceRegionEnd(): void {
  if (!regionActive() || player.paused) return
  if (player.currentTime >= markB.value - 0.03) {
    player.pause()
    player.seek(markB.value)
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
  if (regionActive()) next = Math.max(markA.value, Math.min(markB.value, t))
  player.seek(next)
  tick.value++
}

async function sourceBytes(): Promise<{ data: Uint8Array; mime: string }> {
  if (draftBytes.value) return { data: draftBytes.value, mime: draftMime.value }
  const bytes = await store.takeBytes(props.takeId)
  if (!bytes) throw new Error('Missing take audio')
  return bytes
}

async function reloadPreview(): Promise<void> {
  const seq = ++loadSeq
  waveLoading.value = true
  err.value = null
  try {
    const src = await sourceBytes()
    if (seq !== loadSeq) return
    const listen = await bytesForTakeListen(src.data, draftEdits.value)
    if (seq !== loadSeq) return
    const mime = listen.mime || src.mime || 'application/octet-stream'
    if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
    const copy = new Uint8Array(listen.data.byteLength)
    copy.set(listen.data)
    const url = URL.createObjectURL(new Blob([copy], { type: mime }))
    objectUrl.value = url
    await player.load(url, 'stereo')
    if (seq !== loadSeq) return
    const tr = takeEditsTransform(draftEdits.value)
    await player.setTransform(tr.pitchSemitones, tr.speed)
    player.setLoop(false)
    syncLoopMarks(player.duration)
    const buf = player.getOriginalBuffer?.() ?? null
    peaks.value = buf ? peaksFromAudioBuffer(buf, 800) : syntheticPeaks(800, props.takeId)
    modifiedVsOriginal.value = await store.takeIsModified(props.takeId)
  } catch (e) {
    if (seq !== loadSeq) return
    err.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (seq === loadSeq) {
      waveLoading.value = false
      tick.value++
    }
  }
}

async function applyDraftTransformOnly(): Promise<void> {
  const tr = takeEditsTransform(draftEdits.value)
  await player.setTransform(tr.pitchSemitones, tr.speed)
  tick.value++
}

function scheduleLevelPreview(): void {
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    previewTimer = null
    void reloadPreview()
  }, 280)
}

function cloneEdits(edits: RecorderTakeEdits): RecorderTakeEdits {
  return {
    ...edits,
    compress: edits.compress ? { ...edits.compress } : null,
  }
}

async function bootstrap(): Promise<void> {
  await store.refresh()
  const t = (await store.loadTakes(props.id)).find((x) => x.id === props.takeId) ?? null
  take.value = t
  if (!t || t.sessionId !== props.id) {
    err.value = 'Take not found'
    return
  }
  const edits = normalizeRecorderTakeEdits(t.edits ?? defaultRecorderTakeEdits())
  draftEdits.value = cloneEdits(edits)
  savedEdits.value = cloneEdits(edits)
  draftBytes.value = null
  blobDirty.value = false
  await reloadPreview()
}

async function togglePlay(): Promise<void> {
  if (player.paused) {
    if (regionActive()) {
      const t = player.currentTime
      if (t < markA.value - 0.02 || t >= markB.value - 0.02) player.seek(markA.value)
    }
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
  draftEdits.value = {
    ...draftEdits.value,
    pitchSemitones: clampPitchSemitones(draftEdits.value.pitchSemitones + delta),
  }
}

function setSpeed(v: number): void {
  draftEdits.value = { ...draftEdits.value, speed: v }
}

async function applyCrop(): Promise<void> {
  if (!canCrop.value) return
  cropping.value = true
  err.value = null
  try {
    const src = await sourceBytes()
    const cropped = await cropTakeBytesToWav(src.data, markA.value, markB.value)
    draftBytes.value = cropped.bytes
    draftMime.value = 'audio/wav'
    draftDuration.value = cropped.durationSec
    draftSampleRate.value = cropped.sampleRate
    draftChannels.value = cropped.channels === 2 ? 2 : 1
    blobDirty.value = true
    await reloadPreview()
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e)
  } finally {
    cropping.value = false
  }
}

function requestRestoreOriginal(): void {
  restoreConfirmOpen.value = true
}

async function loadOriginalIntoDraft(): Promise<void> {
  restoreConfirmOpen.value = false
  processing.value = true
  err.value = null
  try {
    const orig = await store.takeOriginalBytes(props.takeId)
    if (!orig) throw new Error('Original take missing')
    draftBytes.value = orig.data
    draftMime.value = orig.mime
    draftDuration.value = orig.durationSec
    draftSampleRate.value = orig.sampleRate
    draftChannels.value = orig.channels
    blobDirty.value = true
    modifiedVsOriginal.value = false
    await reloadPreview()
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e)
  } finally {
    processing.value = false
  }
}

async function saveAndClose(): Promise<void> {
  if (!take.value || saving.value) return
  saving.value = true
  err.value = null
  try {
    if (blobDirty.value && draftBytes.value) {
      const copy = new Uint8Array(draftBytes.value.byteLength)
      copy.set(draftBytes.value)
      const next = await store.replaceTakeAudio({
        takeId: props.takeId,
        data: copy.buffer,
        mime: draftMime.value,
        durationSec: draftDuration.value || duration.value,
        sampleRate: draftSampleRate.value,
        channels: draftChannels.value,
        keepUndo: true,
      })
      if (next) take.value = next
    }
    const saved = await store.updateTakeEdits(props.takeId, draftEdits.value)
    if (saved) take.value = saved
    blobDirty.value = false
    savedEdits.value = cloneEdits(normalizeRecorderTakeEdits(draftEdits.value))
    allowLeave = true
    await router.push({ name: 'recorder-session', params: { id: props.id } })
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}

function promptUnsaved(): Promise<boolean> {
  if (unsavedPromise) return unsavedPromise
  unsavedOpen.value = true
  unsavedPromise = new Promise<boolean>((resolve) => {
    unsavedResolve = resolve
  })
  return unsavedPromise
}

function resolveUnsaved(ok: boolean): void {
  unsavedOpen.value = false
  const resolve = unsavedResolve
  unsavedResolve = null
  unsavedPromise = null
  resolve?.(ok)
}

async function requestClose(): Promise<void> {
  if (dirty.value) {
    const ok = await promptUnsaved()
    if (!ok) return
  }
  allowLeave = true
  void router.push({ name: 'recorder-session', params: { id: props.id } })
}

onBeforeRouteLeave(async () => {
  if (allowLeave || saving.value || !dirty.value) return true
  return promptUnsaved()
})

watch(
  () => [draftEdits.value.pitchSemitones, draftEdits.value.speed] as const,
  () => void applyDraftTransformOnly(),
)

watch(
  () =>
    [
      draftEdits.value.normalize,
      draftEdits.value.compress?.mode ?? 'off',
      draftEdits.value.compress?.intensity ?? 0,
    ] as const,
  () => scheduleLevelPreview(),
)

onMounted(() => {
  player.setUpdateListener(() => {
    tick.value++
    maybeEnforceRegionEnd()
  })
  player.setEndedListener(() => {
    tick.value++
  })
  regionTimer = setInterval(() => maybeEnforceRegionEnd(), 50)
  void bootstrap()
})

onUnmounted(() => {
  if (regionTimer) clearInterval(regionTimer)
  if (previewTimer) clearTimeout(previewTimer)
  player.dispose()
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
})
</script>

<template>
  <section class="edit-page" aria-label="Edit take">
    <p class="back">
      <button type="button" class="linkish" @click="requestClose">← Back to session</button>
    </p>

    <header class="head">
      <h1>Edit take</h1>
      <p v-if="take" class="sub muted">{{ take.label }}</p>
    </header>

    <p v-if="err" class="error" role="alert">{{ err }}</p>
    <p v-if="msg" class="ok" role="status">{{ msg }}</p>

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
      <span class="time">{{ fmt(currentTime) }} / {{ fmt(duration) }}</span>
    </div>

    <p class="hint muted">
      Pitch, speed, normalize, and compressor preview live while you listen. Save stores them as edit
      settings (export bakes them). Crop changes the audio buffer and is kept only if you Save. Drag
      brackets to set a crop region.
    </p>

    <div class="tools card">
      <h2>Audio tools</h2>

      <div class="adjust-row" role="group" aria-label="Pitch and speed">
        <div class="ctrl-field pitch-field" role="group" aria-label="Pitch">
          <span class="ctrl-field-label">Pitch <strong>{{ pitchLabel }}</strong></span>
          <div class="pitch-btns">
            <button
              type="button"
              aria-label="Lower pitch one semitone"
              :disabled="!playbackReady || draftEdits.pitchSemitones <= MIN_PITCH_SEMITONES"
              @click="bumpPitch(-1)"
            >
              −
            </button>
            <button
              type="button"
              aria-label="Raise pitch one semitone"
              :disabled="!playbackReady || draftEdits.pitchSemitones >= MAX_PITCH_SEMITONES"
              @click="bumpPitch(1)"
            >
              +
            </button>
            <button
              type="button"
              :disabled="!playbackReady || !draftEdits.pitchSemitones"
              @click="draftEdits = { ...draftEdits, pitchSemitones: 0 }"
            >
              Reset
            </button>
          </div>
        </div>
        <div class="ctrl-field speed-field">
          <span class="ctrl-field-label">Speed</span>
          <select
            class="speed-select"
            :value="draftEdits.speed"
            aria-label="Edit speed"
            :disabled="!playbackReady"
            @change="setSpeed(Number(($event.target as HTMLSelectElement).value))"
          >
            <option v-for="opt in SPEED_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
      </div>

      <div class="level-tools" role="group" aria-label="Level">
        <div class="ctrl-field normalize-field">
          <span class="ctrl-field-label">Normalize</span>
          <button
            type="button"
            class="ctrl-toggle"
            :aria-pressed="normalizeOn"
            :disabled="waveLoading || cropping || processing"
            @click="normalizeOn = !normalizeOn"
          >
            {{ normalizeOn ? 'On' : 'Off' }}
          </button>
        </div>
        <p class="level-hint muted">
          Peak-normalize before the compressor. Previews live; baked on export when saved.
        </p>

        <label class="level-field">
          Compressor
          <select v-model="compressMode" :disabled="waveLoading || cropping || processing">
            <option value="off">Off</option>
            <option v-for="m in TAKE_COMPRESS_MODE_OPTIONS" :key="m.value" :value="m.value">
              {{ m.label }}
            </option>
          </select>
        </label>
        <label v-if="compressMode !== 'off'" class="level-field">
          <span class="intensity-head">
            Intensity
            <strong>{{ intensityLabel }}</strong>
          </span>
          <input
            v-model.number="compressIntensity"
            type="range"
            min="0"
            max="1"
            step="0.05"
            :disabled="waveLoading || cropping || processing"
            aria-label="Compressor intensity"
          />
          <span class="intensity-ends muted"><span>Light</span><span>Heavy</span></span>
        </label>
        <p class="level-hint muted">{{ compressHint }}</p>
      </div>

      <div class="crop-row">
        <button type="button" class="btn" :disabled="!canCrop || processing" @click="applyCrop">
          {{ cropping ? 'Cropping…' : 'Crop to selection' }}
        </button>
        <button
          type="button"
          class="btn secondary"
          :disabled="processing || (!modifiedVsOriginal && !blobDirty)"
          @click="requestRestoreOriginal"
        >
          Restore original
        </button>
      </div>
    </div>

    <div class="actions">
      <button type="button" class="go" :disabled="!dirty || saving" @click="saveAndClose">
        {{ saving ? 'Saving…' : 'Save' }}
      </button>
      <button type="button" class="btn" :disabled="saving" @click="requestClose">
        Close without saving
      </button>
    </div>

    <ConfirmDialog
      :open="restoreConfirmOpen"
      title="Restore original?"
      message="Reset the draft audio to the original recording. Kept only if you Save."
      confirm-label="Restore"
      :danger="false"
      @close="restoreConfirmOpen = false"
      @confirm="loadOriginalIntoDraft"
    />
    <ConfirmDialog
      :open="unsavedOpen"
      title="Discard edits?"
      message="Close without saving? Unsaved pitch, speed, normalize, compression, and audio changes will be lost."
      confirm-label="Discard"
      @close="resolveUnsaved(false)"
      @confirm="resolveUnsaved(true)"
    />
  </section>
</template>

<style scoped>
.edit-page {
  display: grid;
  gap: 1rem;
  padding: 0.15rem 0 2.5rem;
  min-width: 0;
  max-width: 100%;
}
.back {
  margin: 0;
}
.linkish {
  border: 0;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}
.head h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
}
.sub {
  margin: 0.2rem 0 0;
  font-size: 0.95rem;
}
.wave-wrap {
  position: relative;
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
.transport.muted {
  opacity: 0.55;
  pointer-events: none;
}
.adjust-row {
  display: grid;
  gap: 0.65rem 1rem;
  align-items: end;
}
@media (min-width: 520px) {
  .adjust-row {
    grid-template-columns: minmax(0, 1fr) minmax(6rem, 0.55fr);
  }
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
.normalize-field .ctrl-toggle {
  width: 100%;
  min-height: 44px;
}
.crop-row,
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
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
.btn.secondary {
  background: var(--surface);
}
.btn:disabled,
.go:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
select,
input[type='range'] {
  font: inherit;
  font-size: 16px;
}
select {
  min-height: 40px;
  border-radius: 8px;
  border: 1px solid var(--border);
  padding: 0.35rem 0.5rem;
  background: var(--bg);
  color: inherit;
}
input[type='range'] {
  width: 100%;
  accent-color: var(--accent);
}
.card {
  display: grid;
  gap: 0.75rem;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.card h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.05rem;
}
.level-tools {
  display: grid;
  gap: 0.55rem;
  padding: 0.65rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 85%, var(--bg));
}
.level-field {
  display: grid;
  gap: 0.3rem;
  font-size: 0.85rem;
  color: var(--muted);
}
.intensity-head {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}
.intensity-head strong {
  color: var(--text);
}
.intensity-ends {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
}
.level-hint,
.hint {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.4;
}
.go {
  min-height: 44px;
  padding: 0.45rem 1rem;
  border-radius: 10px;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #fff;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.muted {
  color: var(--muted);
}
.error {
  margin: 0;
  color: var(--danger);
}
.ok {
  margin: 0;
  color: var(--accent);
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
