<script setup lang="ts">
/**
 * Digital Tuner settings — A4, window, device, noise gate, key grid (Phase 3).
 */
import { computed, ref, watch } from 'vue'
import FilterSheet from '../FilterSheet.vue'
import { BARBERSHOP_CHORDS } from '../../domain/arranging/chords'
import type { DigitalTunerPrefs } from '../../lib/preferences/digitalTuner'
import type { KeyGridTemperament } from '../../domain/tuner/keyGridTemperament'

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
const keyPcDraft = ref(0)
const temperamentDraft = ref<KeyGridTemperament>('equal')
const displayDraft = ref<'needle' | 'strobe'>('needle')
const analyzeDraft = ref<'hidden' | 'fft' | 'spectrogram' | 'chord'>('hidden')
const chordLockDraft = ref(false)
const chordNatureDraft = ref('seventh')
const pinnedRootDraft = ref(0)
const customOffsetsDraft = ref<number[]>(Array.from({ length: 12 }, () => 0))
const pianoVisibleDraft = ref(false)
const pianoPinnedDraft = ref(false)

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
    keyPcDraft.value = p.keyPc
    temperamentDraft.value = p.keyGridTemperament
    displayDraft.value = p.tuneDisplay
    analyzeDraft.value = p.analyzeSurface
    chordLockDraft.value = p.chordLockEnabled
    chordNatureDraft.value = p.chordNatureId || 'seventh'
    pinnedRootDraft.value = p.pinnedRootPc ?? p.keyPc
    customOffsetsDraft.value = [...p.customOffsetsCents]
    pianoVisibleDraft.value = p.pianoVisible
    pianoPinnedDraft.value = p.pianoPinned
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

function apply(): void {
  const gateRaw = gateDraft.value.trim()
  const noiseGateDb =
    gateRaw === '' ? null : Number.isFinite(Number(gateRaw)) ? Number(gateRaw) : null
  emit('patch', {
    a4Hz: followPipe.value ? 'followPitchPipe' : a4Draft.value,
    inTuneWindowCents: windowDraft.value,
    chordLockWindowCents: chordWindowDraft.value,
    inputDeviceId: deviceDraft.value || null,
    noiseGateDb,
    keyPc: keyPcDraft.value,
    keyGridTemperament: temperamentDraft.value,
    tuneDisplay: displayDraft.value,
    analyzeSurface: analyzeDraft.value,
    chordLockEnabled: chordLockDraft.value,
    chordNatureId:
      chordLockDraft.value || analyzeDraft.value === 'chord'
        ? chordNatureDraft.value
        : null,
    pinnedRootPc: analyzeDraft.value === 'chord' ? pinnedRootDraft.value : null,
    customOffsetsCents: customOffsetsDraft.value.map((v) =>
      Number.isFinite(v) ? Math.max(-100, Math.min(100, v)) : 0,
    ),
    pianoVisible: pianoVisibleDraft.value,
    pianoPinned: pianoPinnedDraft.value,
  })
  emit('close')
}
</script>

<template>
  <FilterSheet :open="open" title="Tuner settings" fit-content @close="$emit('close')">
    <div class="form">
      <label class="row">
        <span class="label">Display</span>
        <select v-model="displayDraft" class="ctrl">
          <option value="needle">Needle</option>
          <option value="strobe">Strobe</option>
        </select>
      </label>

      <label class="row">
        <span class="label">Analyze surface</span>
        <select v-model="analyzeDraft" class="ctrl">
          <option value="hidden">Tune only</option>
          <option value="chord">Chord (Assisted)</option>
          <option value="fft">FFT</option>
          <option value="spectrogram">Spectrogram</option>
        </select>
      </label>

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
        <input v-model="pianoVisibleDraft" type="checkbox" />
        <span>Show reference piano</span>
      </label>
      <label class="row check">
        <input v-model="pianoPinnedDraft" type="checkbox" :disabled="!pianoVisibleDraft" />
        <span>Keep piano in short landscape</span>
      </label>

      <label class="row check">
        <input v-model="chordLockDraft" type="checkbox" />
        <span>Chord lock (JI role targets)</span>
      </label>
      <template v-if="chordLockDraft || analyzeDraft === 'chord'">
        <label class="row">
          <span class="label">Nature</span>
          <select v-model="chordNatureDraft" class="ctrl">
            <option v-for="n in NATURE_OPTIONS" :key="n.id" :value="n.id">{{ n.name }}</option>
          </select>
        </label>
        <label v-if="analyzeDraft === 'chord'" class="row">
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
.label {
  font-size: 0.85rem;
  color: var(--muted);
  font-weight: 600;
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
