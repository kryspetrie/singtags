<script setup lang="ts">
/**
 * Digital Tuner settings — A4, window, device, noise gate, key grid (Phase 3).
 */
import { computed, ref, watch } from 'vue'
import FilterSheet from '../FilterSheet.vue'
import { BARBERSHOP_CHORDS } from '../../domain/arranging/chords'
import {
  prefsForPitchRange,
  type DigitalTunerPrefs,
  type PitchRangeId,
} from '../../lib/preferences/digitalTuner'
import type { KeyGridTemperament } from '../../domain/tuner/keyGridTemperament'
import { PITCH_RANGE_PRESETS } from '../../domain/tuner/pitchRange'

const props = defineProps<{
  open: boolean
  prefs: DigitalTunerPrefs
  devices: MediaDeviceInfo[]
  resolvedA4: number
}>()

const emit = defineEmits<{
  close: []
  patch: [Partial<DigitalTunerPrefs>]
}>()

const followPipe = ref(true)
const a4Draft = ref(440)
const windowDraft = ref(10)
const chordWindowDraft = ref(5)
const deviceDraft = ref<string>('')
const gateDraft = ref<string>('')
const detectionDraft = ref(55)
const salienceDraft = ref(35)
const keyPcDraft = ref(0)
const temperamentDraft = ref<KeyGridTemperament>('equal')
const displayDraft = ref<'needle' | 'strobe' | 'scope'>('needle')
const strobeStyleDraft = ref<'horizontal' | 'radial'>('horizontal')
const sessionStripDraft = ref(true)
const pitchRangeDraft = ref<PitchRangeId>('voice')
const pitchMinDraft = ref(55)
const pitchMaxDraft = ref(1200)
const chordLockDraft = ref(false)
const analyzePinDraft = ref(false)
const chordNatureDraft = ref('seventh')
const pinnedRootDraft = ref(0)
const customOffsetsDraft = ref<number[]>(Array.from({ length: 12 }, () => 0))
const PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const NATURE_OPTIONS = BARBERSHOP_CHORDS.map((c) => ({ id: c.id, name: c.name }))

watch(
  () => [props.open, props.prefs] as const,
  ([open]) => {
    if (!open) return
    const p = props.prefs
    followPipe.value = p.a4Hz === 'followPitchPipe'
    a4Draft.value = typeof p.a4Hz === 'number' ? p.a4Hz : Math.round(props.resolvedA4)
    windowDraft.value = p.inTuneWindowCents
    chordWindowDraft.value = p.chordLockWindowCents
    deviceDraft.value = p.inputDeviceId ?? ''
    gateDraft.value = p.noiseGateDb == null ? '' : String(p.noiseGateDb)
    detectionDraft.value = Math.round(p.detectionThreshold * 100)
    salienceDraft.value = Math.round(p.multiF0SalienceFloor * 100)
    keyPcDraft.value = p.keyPc
    temperamentDraft.value = p.keyGridTemperament
    displayDraft.value = p.tuneDisplay
    strobeStyleDraft.value = p.strobeStyle
    sessionStripDraft.value = p.sessionStripEnabled
    pitchRangeDraft.value = p.pitchRangeId
    pitchMinDraft.value = p.pitchFMinHz
    pitchMaxDraft.value = p.pitchFMaxHz
    chordLockDraft.value = p.chordLockEnabled
    analyzePinDraft.value = p.chordNatureId != null
    chordNatureDraft.value = p.chordNatureId || 'seventh'
    pinnedRootDraft.value = p.pinnedRootPc ?? p.keyPc
    customOffsetsDraft.value = [...p.customOffsetsCents]
  },
  { immediate: true },
)

const deviceOptions = computed(() => {
  const list = props.devices.map((d, i) => ({
    id: d.deviceId,
    label: d.label || `Microphone ${i + 1}`,
  }))
  if (deviceDraft.value && !list.some((d) => d.id === deviceDraft.value)) {
    list.unshift({ id: deviceDraft.value, label: 'Current device' })
  }
  return list
})

function onPitchRangeSelect(): void {
  if (pitchRangeDraft.value === 'custom') return
  const band = prefsForPitchRange(pitchRangeDraft.value)
  pitchMinDraft.value = band.pitchFMinHz
  pitchMaxDraft.value = band.pitchFMaxHz
}

function onPitchHzEdit(): void {
  pitchRangeDraft.value = 'custom'
}

function apply(): void {
  const gateRaw = gateDraft.value.trim()
  const noiseGateDb =
    gateRaw === '' ? null : Number.isFinite(Number(gateRaw)) ? Number(gateRaw) : null
  const pitch = prefsForPitchRange(pitchRangeDraft.value, pitchMinDraft.value, pitchMaxDraft.value)
  emit('patch', {
    a4Hz: followPipe.value ? 'followPitchPipe' : a4Draft.value,
    inTuneWindowCents: windowDraft.value,
    chordLockWindowCents: chordWindowDraft.value,
    inputDeviceId: deviceDraft.value || null,
    noiseGateDb,
    detectionThreshold: Math.max(0.15, Math.min(0.9, detectionDraft.value / 100)),
    multiF0SalienceFloor: Math.max(0.15, Math.min(0.9, salienceDraft.value / 100)),
    ...pitch,
    keyPc: keyPcDraft.value,
    keyGridTemperament: temperamentDraft.value,
    tuneDisplay: displayDraft.value,
    strobeStyle: strobeStyleDraft.value,
    sessionStripEnabled: sessionStripDraft.value,
    // Tune JI targets — independent of Analyze pin.
    chordLockEnabled: chordLockDraft.value,
    // Analyze Chord pin (Assisted) — always persisted when enabled; does not require Chord lock.
    chordNatureId: analyzePinDraft.value || chordLockDraft.value ? chordNatureDraft.value : null,
    pinnedRootPc: analyzePinDraft.value || chordLockDraft.value ? pinnedRootDraft.value : null,
    customOffsetsCents: customOffsetsDraft.value.map((v) =>
      Number.isFinite(v) ? Math.max(-100, Math.min(100, v)) : 0,
    ),
  })
  emit('close')
}
</script>

<template>
  <FilterSheet :open="open" title="Tuner settings" fit-content @close="$emit('close')">
    <div class="form">
      <label class="row">
        <span class="label">Tune display</span>
        <select v-model="displayDraft" class="ctrl">
          <option value="needle">Needle</option>
          <option value="strobe">Strobe (phase bands)</option>
          <option value="scope">Scope (wave freezes when in tune)</option>
        </select>
      </label>
      <label v-if="displayDraft === 'strobe'" class="row">
        <span class="label">Strobe style</span>
        <select v-model="strobeStyleDraft" class="ctrl">
          <option value="horizontal">Horizontal bands</option>
          <option value="radial">Radial spokes</option>
        </select>
      </label>
      <label class="row check">
        <input v-model="sessionStripDraft" type="checkbox" />
        <span>Phrase % in-tune strip + history under Tune and Chord</span>
      </label>

      <label class="row">
        <span class="label">
          Pitch range
          <span class="hint">Tune · Chord · FFT · Spec reaction band</span>
        </span>
        <select v-model="pitchRangeDraft" class="ctrl" @change="onPitchRangeSelect">
          <option v-for="p in PITCH_RANGE_PRESETS" :key="p.id" :value="p.id">
            {{ p.label }} ({{ p.minHz }}–{{ p.maxHz }} Hz)
          </option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <div class="row pitch-hz">
        <label>
          <span class="label">Min Hz</span>
          <input
            v-model.number="pitchMinDraft"
            class="ctrl"
            type="number"
            min="20"
            max="20000"
            step="1"
            @change="onPitchHzEdit"
          />
        </label>
        <label>
          <span class="label">Max Hz</span>
          <input
            v-model.number="pitchMaxDraft"
            class="ctrl"
            type="number"
            min="20"
            max="20000"
            step="1"
            @change="onPitchHzEdit"
          />
        </label>
      </div>

      <label class="row check">
        <input v-model="followPipe" type="checkbox" />
        <span>A4 follows Pitch Pipe ({{ Math.round(resolvedA4) }} Hz)</span>
      </label>
      <label v-if="!followPipe" class="row">
        <span class="label">Concert A (Hz)</span>
        <input
          v-model.number="a4Draft"
          class="ctrl"
          type="number"
          min="400"
          max="480"
          step="0.1"
        />
      </label>

      <label class="row">
        <span class="label">In-tune window (¢)</span>
        <input
          v-model.number="windowDraft"
          class="ctrl"
          type="number"
          min="1"
          max="50"
          step="1"
        />
      </label>

      <label class="row">
        <span class="label">Key</span>
        <select v-model.number="keyPcDraft" class="ctrl">
          <option v-for="(n, i) in PC_NAMES" :key="n" :value="i">{{ n }}</option>
        </select>
      </label>

      <label class="row">
        <span class="label">Key grid</span>
        <select v-model="temperamentDraft" class="ctrl">
          <option value="equal">Equal</option>
          <option value="justTriad">Just triad</option>
          <option value="custom">Custom</option>
        </select>
      </label>

      <fieldset v-if="temperamentDraft === 'custom'" class="offsets">
        <legend class="label">Custom offsets (¢ per pitch class)</legend>
        <div class="offset-grid">
          <label v-for="(n, i) in PC_NAMES" :key="`off-${n}`" class="offset">
            <span>{{ n }}</span>
            <input
              v-model.number="customOffsetsDraft[i]"
              class="ctrl tiny"
              type="number"
              min="-100"
              max="100"
              step="1"
            />
          </label>
        </div>
      </fieldset>

      <label class="row check">
        <input v-model="analyzePinDraft" type="checkbox" />
        <span>Analyze Chord pin (required for Locked/Fix colors)</span>
      </label>
      <label class="row check">
        <input v-model="chordLockDraft" type="checkbox" />
        <span>Tune chord lock (JI role targets on needle/strobe/scope)</span>
      </label>
      <template v-if="analyzePinDraft || chordLockDraft">
        <label class="row">
          <span class="label">Nature</span>
          <select v-model="chordNatureDraft" class="ctrl">
            <option v-for="n in NATURE_OPTIONS" :key="n.id" :value="n.id">{{ n.name }}</option>
          </select>
        </label>
        <label class="row">
          <span class="label">Pinned root</span>
          <select v-model.number="pinnedRootDraft" class="ctrl">
            <option v-for="(n, i) in PC_NAMES" :key="`root-${n}`" :value="i">{{ n }}</option>
          </select>
        </label>
        <label class="row">
          <span class="label">Chord-lock window (¢)</span>
          <input
            v-model.number="chordWindowDraft"
            class="ctrl"
            type="number"
            min="1"
            max="50"
            step="1"
          />
        </label>
      </template>

      <label class="row">
        <span class="label">Microphone</span>
        <select v-model="deviceDraft" class="ctrl">
          <option value="">Default</option>
          <option v-for="d in deviceOptions" :key="d.id" :value="d.id">{{ d.label }}</option>
        </select>
      </label>

      <label class="row">
        <span class="label">Noise gate (dB)</span>
        <input
          v-model="gateDraft"
          class="ctrl"
          type="number"
          min="-80"
          max="-10"
          step="1"
          placeholder="Auto"
        />
      </label>

      <label class="row">
        <span class="label">
          Tune clarity ({{ detectionDraft }}%)
          <span class="hint">Higher = stricter solo pitch accept</span>
        </span>
        <input
          v-model.number="detectionDraft"
          class="ctrl range"
          type="range"
          min="15"
          max="90"
          step="1"
        />
      </label>

      <label class="row">
        <span class="label">
          Multi-note salience ({{ salienceDraft }}%)
          <span class="hint">Higher = fewer false Chord/FFT/Spec peaks</span>
        </span>
        <input
          v-model.number="salienceDraft"
          class="ctrl range"
          type="range"
          min="15"
          max="90"
          step="1"
        />
      </label>

      <div class="actions">
        <button type="button" class="btn" @click="$emit('close')">Cancel</button>
        <button type="button" class="btn primary" @click="apply">Save</button>
      </div>
    </div>
  </FilterSheet>
</template>

<style scoped>
.form {
  display: grid;
  gap: 0.75rem;
  padding: 0.25rem 0 0.5rem;
}
.row {
  display: grid;
  gap: 0.35rem;
}
.row.check {
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.5rem;
}
.pitch-hz {
  grid-template-columns: 1fr 1fr;
  display: grid;
  gap: 0.5rem;
}
.pitch-hz label {
  display: grid;
  gap: 0.35rem;
}
.label {
  font-size: 0.85rem;
  color: var(--muted);
  font-weight: 600;
}
.hint {
  display: block;
  font-weight: 500;
  font-size: 0.75rem;
  opacity: 0.85;
}
.ctrl {
  min-height: 44px;
  padding: 0.45rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.ctrl.range {
  padding: 0.35rem 0;
  border: none;
  background: transparent;
  min-height: 36px;
  accent-color: var(--accent);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
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
.btn.primary {
  background: var(--accent);
  color: var(--on-accent);
  border-color: var(--accent);
}
.offsets {
  margin: 0;
  padding: 0;
  border: none;
  display: grid;
  gap: 0.35rem;
}
.offset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(4.5rem, 1fr));
  gap: 0.35rem;
}
.offset {
  display: grid;
  gap: 0.2rem;
  font-size: 0.75rem;
  color: var(--muted);
}
.ctrl.tiny {
  min-height: 36px;
  padding: 0.25rem 0.35rem;
}
</style>
