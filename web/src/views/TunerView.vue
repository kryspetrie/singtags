<script setup lang="ts">
/**
 * Digital Tuner shell (Labs) — Tune Detail + Glance. Keep under 800 lines.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { usePreferencesStore } from '../stores/preferences'
import { useTunerCapture } from '../composables/useTunerCapture'
import { useTunerLayout } from '../composables/useTunerLayout'
import { formatDisplayCents, isInTuneCents } from '../domain/tuner/displayCents'
import { tuneReadingFromHz } from '../domain/tuner/tuneTarget'
import { acquireWakeLock, releaseWakeLock } from '../lib/wakeLock'
import type { DigitalTunerPrefs } from '../lib/preferences/digitalTuner'
import TunerNeedle from '../components/tuner/TunerNeedle.vue'
import TunerStrobe from '../components/tuner/TunerStrobe.vue'
import TunerGlance from '../components/tuner/TunerGlance.vue'
import TunerSettingsSheet from '../components/tuner/TunerSettingsSheet.vue'

const prefs = usePreferencesStore()
const { mode } = useTunerLayout()
const capture = useTunerCapture()

const frozen = ref(false)
const frozenReading = ref<{ hz: number | null; clarity: number } | null>(null)
const settingsOpen = ref(false)
/** Cold start always Detail — sticky glance only after mic is running. */
const glanceOpen = ref(false)
const reducedMotion = ref(false)

const a4Hz = computed(() => prefs.resolveTunerA4Hz())
const tunerPrefs = computed(() => prefs.digitalTunerPrefs)
const windowCents = computed(() =>
  tunerPrefs.value.chordLockEnabled
    ? tunerPrefs.value.chordLockWindowCents
    : tunerPrefs.value.inTuneWindowCents,
)

const live = computed(() => {
  if (frozen.value && frozenReading.value) return frozenReading.value
  return { hz: capture.reading.value.hz, clarity: capture.reading.value.clarity }
})

const reading = computed(() => {
  const hz = live.value.hz
  if (hz == null) return null
  return tuneReadingFromHz(hz, {
    a4Hz: a4Hz.value,
    keyPc: tunerPrefs.value.keyPc,
    temperament: tunerPrefs.value.keyGridTemperament,
    customOffsetsCents: tunerPrefs.value.customOffsetsCents,
    chordLockEnabled: tunerPrefs.value.chordLockEnabled,
    chordNatureId: tunerPrefs.value.chordNatureId,
  })
})

const centsLabel = computed(() => {
  if (!reading.value) return '—'
  return formatDisplayCents(reading.value.errorCents, { clarity: live.value.clarity })
})

const inTune = computed(() => {
  if (!reading.value) return false
  return isInTuneCents(reading.value.errorCents, windowCents.value)
})

const statusWord = computed((): 'IN TUNE' | 'SHARP' | 'FLAT' | 'WAIT' => {
  if (!capture.running.value) return 'WAIT'
  if (!reading.value) return 'WAIT'
  if (inTune.value) return 'IN TUNE'
  return reading.value.errorCents > 0 ? 'SHARP' : 'FLAT'
})

const legend = computed(() => {
  if (reading.value?.targetKind === 'chordLock') {
    const nature = tunerPrefs.value.chordNatureId || 'chord'
    return `vs Chord lock · ${nature} · A=${Math.round(a4Hz.value)}`
  }
  const grid =
    tunerPrefs.value.keyGridTemperament === 'equal'
      ? 'Equal'
      : tunerPrefs.value.keyGridTemperament === 'justTriad'
        ? 'Just triad'
        : 'Custom'
  return `vs ${grid} · A=${Math.round(a4Hz.value)}`
})

const showStrobe = computed(() => {
  if (reducedMotion.value) return false
  return tunerPrefs.value.tuneDisplay === 'strobe'
})

function syncAnalysisOpts(): void {
  capture.setAnalysisOpts({ noiseGateDb: tunerPrefs.value.noiseGateDb })
}

function toggleFreeze(): void {
  if (!capture.running.value) return
  if (frozen.value) {
    frozen.value = false
    frozenReading.value = null
    return
  }
  frozen.value = true
  frozenReading.value = {
    hz: capture.reading.value.hz,
    clarity: capture.reading.value.clarity,
  }
}

async function onStart(): Promise<void> {
  frozen.value = false
  frozenReading.value = null
  syncAnalysisOpts()
  await capture.start({ deviceId: tunerPrefs.value.inputDeviceId })
  if (capture.deviceId.value) {
    prefs.setDigitalTunerPrefs({ inputDeviceId: capture.deviceId.value })
  }
  if (capture.running.value && tunerPrefs.value.glanceFullscreen) {
    await enterGlance()
  }
}

async function onStop(): Promise<void> {
  await exitGlance()
  frozen.value = false
  frozenReading.value = null
  await capture.stop()
}

async function enterGlance(): Promise<void> {
  if (!capture.running.value) return
  glanceOpen.value = true
  prefs.setDigitalTunerPrefs({ glanceFullscreen: true })
  await acquireWakeLock('tuner')
}

async function exitGlance(): Promise<void> {
  glanceOpen.value = false
  prefs.setDigitalTunerPrefs({ glanceFullscreen: false })
  await releaseWakeLock('tuner')
}

async function onSettingsPatch(patch: Partial<DigitalTunerPrefs>): Promise<void> {
  const prevDevice = tunerPrefs.value.inputDeviceId
  prefs.setDigitalTunerPrefs(patch)
  syncAnalysisOpts()
  if (
    capture.running.value &&
    patch.inputDeviceId !== undefined &&
    patch.inputDeviceId !== prevDevice
  ) {
    await capture.start({ deviceId: patch.inputDeviceId })
  }
}

function onKeydown(ev: KeyboardEvent): void {
  const tag = (ev.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
  if (ev.key === 'Escape') {
    if (settingsOpen.value) {
      settingsOpen.value = false
      ev.preventDefault()
      return
    }
    if (glanceOpen.value) {
      void exitGlance()
      ev.preventDefault()
    }
    return
  }
  if (ev.key === ' ' || ev.code === 'Space') {
    if (capture.running.value && !glanceOpen.value) {
      toggleFreeze()
      ev.preventDefault()
    }
  }
}

watch(
  () => capture.running.value,
  (on) => {
    if (!on) {
      frozen.value = false
      frozenReading.value = null
      void exitGlance()
    }
  },
)

watch(
  () => tunerPrefs.value.noiseGateDb,
  () => syncAnalysisOpts(),
)

onMounted(() => {
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.addEventListener('keydown', onKeydown)
  void capture.refreshDevices()
  syncAnalysisOpts()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  void releaseWakeLock('tuner')
})
</script>

<template>
  <section class="tuner" :data-layout="mode">
    <header class="toolbar">
      <div class="title-row">
        <h1 class="title">Digital Tuner</h1>
        <div class="title-actions">
          <button type="button" class="btn icon" title="Settings" @click="settingsOpen = true">
            Settings
          </button>
          <button
            v-if="capture.running.value"
            type="button"
            class="btn icon"
            title="Rehearsal glance"
            @click="enterGlance"
          >
            Rehearsal
          </button>
        </div>
      </div>
      <p class="privacy">
        On-device only — mic audio never leaves this browser. Analysis clears when you leave.
      </p>
      <div class="actions">
        <button
          v-if="!capture.running.value"
          type="button"
          class="btn primary"
          @click="onStart"
        >
          Allow microphone
        </button>
        <template v-else>
          <button type="button" class="btn" :class="{ on: frozen }" @click="toggleFreeze">
            {{ frozen ? 'Unfreeze' : 'Freeze' }}
          </button>
          <button type="button" class="btn" @click="onStop">Stop</button>
        </template>
      </div>
    </header>

    <p v-if="capture.errorMessage.value" class="err" role="alert">
      {{ capture.errorMessage.value }}
      <button type="button" class="btn link" @click="onStart">Retry</button>
    </p>

    <div class="stage">
      <div class="readout" aria-live="polite">
        <div class="note">{{ reading?.name ?? '—' }}</div>
        <div class="cents" :class="{ in: inTune }">{{ centsLabel }}</div>
        <div class="status">{{ statusWord }}</div>
        <div class="legend">{{ legend }}</div>
      </div>
      <TunerStrobe
        v-if="showStrobe"
        :cents="reading?.errorCents ?? null"
        :in-tune="inTune"
        :active="capture.running.value && !frozen"
      />
      <TunerNeedle v-else :cents="reading?.errorCents ?? null" :in-tune="inTune" />
    </div>

    <div class="level" aria-hidden="true">
      <div
        class="level-fill"
        :style="{ width: `${Math.round(capture.reading.value.level * 100)}%` }"
      />
    </div>

    <TunerSettingsSheet
      :open="settingsOpen"
      :prefs="tunerPrefs"
      :devices="capture.devices.value"
      :resolved-a4="a4Hz"
      @close="settingsOpen = false"
      @patch="onSettingsPatch"
    />

    <TunerGlance
      v-if="glanceOpen"
      :status-word="statusWord"
      :note-name="reading?.name ?? null"
      @exit="exitGlance"
    />
  </section>
</template>

<style scoped>
.tuner {
  display: grid;
  gap: 1rem;
  width: 100%;
  max-width: 56rem;
  margin: 0 auto;
  padding: 0.5rem 0.75rem calc(1rem + var(--bottom-nav-h, 0px) + env(safe-area-inset-bottom));
  box-sizing: border-box;
  min-height: calc(100dvh - var(--header-h, 3.5rem) - var(--bottom-nav-h, 0px));
}
.toolbar {
  display: grid;
  gap: 0.35rem;
}
.title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.title-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.35rem, 3vw, 1.75rem);
}
.privacy {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.35;
  max-width: 40rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.35rem;
}
.btn {
  min-height: 44px;
  padding: 0.45rem 0.9rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.btn.icon {
  min-height: 40px;
  padding: 0.35rem 0.7rem;
  font-size: 0.9rem;
}
.btn.primary {
  background: var(--accent);
  color: var(--on-accent);
  border-color: var(--accent);
}
.btn.on {
  border-color: var(--accent);
  color: var(--accent);
}
.btn.link {
  border: none;
  background: transparent;
  color: var(--accent);
  min-height: 36px;
  padding: 0.2rem 0.4rem;
}
.err {
  margin: 0;
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--danger) 12%, var(--surface));
  color: var(--danger);
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.stage {
  display: grid;
  gap: 1rem;
  align-items: center;
}
.tuner[data-layout='wide'] .stage {
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
}
.readout {
  display: grid;
  gap: 0.2rem;
  justify-items: start;
}
.tuner[data-layout='narrow-portrait'] .readout {
  justify-items: center;
  text-align: center;
}
.note {
  font-family: var(--font-display);
  font-size: clamp(2.75rem, 12vw, 4.5rem);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
}
.cents {
  font-size: clamp(1.25rem, 4vw, 1.75rem);
  font-variant-numeric: tabular-nums;
  min-height: 1.2em;
}
.cents.in {
  color: var(--accent);
}
.status {
  font-weight: 700;
  letter-spacing: 0.06em;
  font-size: 0.95rem;
  color: var(--muted);
}
.legend {
  font-size: 0.85rem;
  color: var(--muted);
}
.level {
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--border) 70%, var(--surface));
  overflow: hidden;
}
.level-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.08s linear;
}
.tuner[data-layout='narrow-landscape'] {
  gap: 0.5rem;
  padding-top: 0.25rem;
}
.tuner[data-layout='narrow-landscape'] .stage {
  grid-template-columns: minmax(0, 0.7fr) minmax(0, 1fr);
}
.tuner[data-layout='narrow-landscape'] .note {
  font-size: clamp(1.75rem, 8vw, 2.5rem);
}
.tuner[data-layout='narrow-landscape'] .privacy {
  display: none;
}
@media (prefers-reduced-motion: reduce) {
  .level-fill {
    transition: none;
  }
}
</style>
