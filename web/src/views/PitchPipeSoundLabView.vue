<script setup lang="ts">
/**
 * Pitch-pipe voice lab: edit JSON-schema voices, A/B vs classic, save locally,
 * and set the app-wide pitch pipe / pay-the-key sound.
 */
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { pitchPipeDisplay, pitchPipeNotes, PitchPlayer } from '../audio/pitchPlayer'
import {
  clearActivePitchPipeVoice,
  clonePitchPipeVoice,
  DEFAULT_PITCH_PIPE_VOICE,
  finalizePitchPipeVoiceForSave,
  formatPitchPipeVoiceExport,
  getActivePitchPipeVoice,
  hasCustomActivePitchPipeVoice,
  loadPitchPipeVoiceLibrary,
  newPartial,
  parsePitchPipeVoice,
  pitchPipeVoiceShareMailto,
  PITCH_PIPE_FILTER_TYPE_OPTIONS,
  PITCH_PIPE_WAVEFORM_OPTIONS,
  removePitchPipeVoiceFromLibrary,
  setActivePitchPipeVoice,
  upsertPitchPipeVoiceLibrary,
  type PitchPipeVoiceConfig,
  type PitchPipeWaveform,
} from '../audio/pitchPipeVoice'

/** Full barbershop pipe range for A/B listening. */
const PIPE_NOTES = pitchPipeNotes('e3-e4')
const LEGACY_DRAFTS_KEY = 'singtags.pitchPipeVoiceLab.drafts.v1'

type PlaySource = 'editor' | 'classic' | string

const player = new PitchPlayer(clonePitchPipeVoice(DEFAULT_PITCH_PIPE_VOICE))
const voice = reactive(clonePitchPipeVoice(getActivePitchPipeVoice()))
const library = ref<PitchPipeVoiceConfig[]>(migrateAndLoadLibrary())
const activeVoice = ref(getActivePitchPipeVoice())
const customActive = ref(hasCustomActivePitchPipeVoice())
const playSource = ref<PlaySource>('editor')
const current = ref<string | null>(null)
const sustain = ref(false)
const statusMsg = ref<string | null>(null)
const importText = ref('')
const importError = ref<string | null>(null)

const exportJson = computed(() =>
  formatPitchPipeVoiceExport(finalizePitchPipeVoiceForSave(voice as PitchPipeVoiceConfig)),
)

const playSourceOptions = computed(() => {
  const opts: Array<{ value: PlaySource; label: string }> = [
    { value: 'editor', label: 'Editor (current sliders)' },
    { value: 'classic', label: 'Mellow (built-in default)' },
  ]
  for (const v of library.value) {
    opts.push({ value: v.id, label: `Saved: ${v.label}` })
  }
  return opts
})

const playingVoiceLabel = computed(() => {
  const src = playSource.value
  if (src === 'editor') return voice.label || 'Editor'
  if (src === 'classic') return DEFAULT_PITCH_PIPE_VOICE.label
  return library.value.find((v) => v.id === src)?.label ?? src
})

const activeIsClassic = computed(
  () => !customActive.value || activeVoice.value.id === DEFAULT_PITCH_PIPE_VOICE.id,
)

const filterEnabled = computed({
  get: () => voice.filter != null,
  set: (on: boolean) => {
    if (on) {
      voice.filter = voice.filter ?? { type: 'lowpass', frequencyHz: 2400, Q: 0.7 }
    } else {
      voice.filter = null
    }
  },
})

const shareMailto = computed(() =>
  pitchPipeVoiceShareMailto(finalizePitchPipeVoiceForSave(voice as PitchPipeVoiceConfig)),
)

onUnmounted(() => player.dispose())

watch(
  [voice, playSource, library],
  () => {
    player.setVoice(resolvePlayVoice())
    if (current.value || sustain.value) void player.restartIfPlaying()
  },
  { deep: true },
)

function migrateAndLoadLibrary(): PitchPipeVoiceConfig[] {
  const existing = loadPitchPipeVoiceLibrary()
  if (existing.length) return existing
  try {
    const raw = localStorage.getItem(LEGACY_DRAFTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const migrated = parsed
      .map((item) => parsePitchPipeVoice(item))
      .filter((v): v is PitchPipeVoiceConfig => !!v)
    if (migrated.length) {
      for (const v of [...migrated].reverse()) upsertPitchPipeVoiceLibrary(v)
      localStorage.removeItem(LEGACY_DRAFTS_KEY)
      return loadPitchPipeVoiceLibrary()
    }
  } catch {
    /* ignore */
  }
  return []
}

function refreshActive(): void {
  activeVoice.value = getActivePitchPipeVoice()
  customActive.value = hasCustomActivePitchPipeVoice()
}

function resolvePlayVoice(): PitchPipeVoiceConfig {
  const src = playSource.value
  if (src === 'editor') return clonePitchPipeVoice(voice as PitchPipeVoiceConfig)
  if (src === 'classic') return clonePitchPipeVoice(DEFAULT_PITCH_PIPE_VOICE)
  const saved = library.value.find((v) => v.id === src)
  return clonePitchPipeVoice(saved ?? (voice as PitchPipeVoiceConfig))
}

function noteLabel(note: string): string {
  const d = pitchPipeDisplay(note)
  if (d.isBlack && d.sharp && d.flat) return `${d.sharp}/${d.flat}`
  return d.sharp ?? note
}

function flash(msg: string): void {
  statusMsg.value = msg
  window.setTimeout(() => {
    if (statusMsg.value === msg) statusMsg.value = null
  }, 3200)
}

async function down(note: string): Promise<void> {
  player.setVoice(resolvePlayVoice())
  current.value = note
  await player.start(note, 0)
}

function up(): void {
  if (sustain.value) return
  current.value = null
  player.stop(true)
}

async function onSustainChange(e: Event): Promise<void> {
  sustain.value = (e.target as HTMLInputElement).checked
  if (!sustain.value) {
    current.value = null
    player.stop(true)
    return
  }
  const note = current.value ?? 'A3'
  current.value = note
  player.setVoice(resolvePlayVoice())
  await player.start(note, 0)
}

function loadClassicIntoEditor(): void {
  Object.assign(voice, clonePitchPipeVoice(DEFAULT_PITCH_PIPE_VOICE))
  playSource.value = 'editor'
  flash('Loaded mellow into editor')
}

function loadActiveIntoEditor(): void {
  Object.assign(voice, clonePitchPipeVoice(getActivePitchPipeVoice()))
  playSource.value = 'editor'
  flash('Loaded your current pitch sound into editor')
}

function addPartial(): void {
  if (voice.partials.length >= 6) return
  voice.partials.push(newPartial('triangle'))
}

function removePartial(i: number): void {
  if (voice.partials.length <= 1) return
  voice.partials.splice(i, 1)
}

function onWaveChange(i: number, e: Event): void {
  voice.partials[i]!.type = (e.target as HTMLSelectElement).value as PitchPipeWaveform
}

function saveToLibrary(): void {
  const next = finalizePitchPipeVoiceForSave(voice as PitchPipeVoiceConfig)
  Object.assign(voice, clonePitchPipeVoice(next))
  library.value = upsertPitchPipeVoiceLibrary(next)
  playSource.value = next.id
  flash(`Saved “${next.label}” to this device`)
}

function loadSaved(v: PitchPipeVoiceConfig): void {
  Object.assign(voice, clonePitchPipeVoice(v))
  playSource.value = 'editor'
  flash(`Editing “${v.label}”`)
}

function deleteSaved(id: string): void {
  library.value = removePitchPipeVoiceFromLibrary(id)
  if (playSource.value === id) playSource.value = 'editor'
  flash('Removed saved sound')
}

function setAsMyPitchSound(from: PitchPipeVoiceConfig = voice as PitchPipeVoiceConfig): void {
  const next = finalizePitchPipeVoiceForSave(from, { keepId: true })
  setActivePitchPipeVoice(next)
  refreshActive()
  flash(`“${next.label}” is now your pitch pipe / pay-the-key sound`)
}

function useClassicAsMyPitchSound(): void {
  clearActivePitchPipeVoice()
  refreshActive()
  flash('Restored built-in pitch sound')
}

async function copyExport(): Promise<void> {
  try {
    await navigator.clipboard.writeText(exportJson.value)
    flash('JSON copied — paste into email or chat')
  } catch {
    flash('Clipboard blocked — select the JSON below and copy manually')
  }
}

function applyImport(): void {
  importError.value = null
  try {
    const parsed = parsePitchPipeVoice(JSON.parse(importText.value) as unknown)
    if (!parsed) {
      importError.value = 'Could not parse — need a partials array with waveform types.'
      return
    }
    Object.assign(voice, clonePitchPipeVoice(parsed))
    playSource.value = 'editor'
    importText.value = ''
    flash(`Loaded “${parsed.label}” into editor`)
  } catch {
    importError.value = 'Invalid JSON.'
  }
}
</script>

<template>
  <section class="lab" aria-label="Pitch pipe sound lab">
    <header class="head">
      <RouterLink class="btn btn-ghost back" to="/labs">← Labs</RouterLink>
      <h1 class="title">Pitch pipe sound lab</h1>
      <p class="intro">
        Design alternate pitch-pipe voices (same JSON schema the app plays). Hold notes to hear the
        selected source, save candidates on this device, and optionally make one your default for
        Pitch Pipe and pay-the-key.
      </p>
    </header>

    <section class="card" aria-labelledby="play-h">
      <h2 id="play-h" class="card-title">Play · E3–E4</h2>
      <label class="field">
        <span class="lbl">Hearing</span>
        <select v-model="playSource" aria-label="Which voice to play">
          <option v-for="o in playSourceOptions" :key="o.value" :value="o.value">
            {{ o.label }}
          </option>
        </select>
      </label>
      <p class="hint">Playing: <strong>{{ playingVoiceLabel }}</strong></p>
      <div class="notes" role="group" aria-label="E3 to E4 chromatic notes">
        <button
          v-for="note in PIPE_NOTES"
          :key="note"
          type="button"
          class="note"
          :class="{ active: current === note, black: pitchPipeDisplay(note).isBlack }"
          :aria-pressed="current === note"
          :aria-label="`Play ${note}`"
          @pointerdown.prevent="down(note)"
          @pointerup.prevent="up"
          @pointerleave.prevent="up"
          @pointercancel.prevent="up"
        >
          {{ noteLabel(note) }}
        </button>
      </div>
      <label class="sustain">
        <input type="checkbox" :checked="sustain" @change="onSustainChange" />
        Sustain last note (live-tweak while sounding)
      </label>
    </section>

    <section class="card" aria-labelledby="default-h">
      <h2 id="default-h" class="card-title">Your pitch sound</h2>
      <p class="hint">
        App default:
        <strong>{{ activeVoice.label }}</strong>
        <span v-if="activeIsClassic"> (built-in)</span>
        <span v-else> (custom on this device)</span>
      </p>
      <div class="row-actions">
        <button type="button" class="btn btn-primary" @click="setAsMyPitchSound()">
          Use editor as my pitch sound
        </button>
        <button
          type="button"
          class="btn"
          :disabled="activeIsClassic"
          @click="useClassicAsMyPitchSound"
        >
          Restore built-in
        </button>
        <button type="button" class="btn btn-ghost" @click="loadActiveIntoEditor">
          Load my sound into editor
        </button>
        <button type="button" class="btn btn-ghost" @click="loadClassicIntoEditor">
          Load mellow into editor
        </button>
      </div>
    </section>

    <section class="card" aria-labelledby="library-h">
      <div class="card-head">
        <h2 id="library-h" class="card-title">Saved on this device</h2>
        <button type="button" class="btn" @click="saveToLibrary">Save editor</button>
      </div>
      <p v-if="!library.length" class="hint">No saved sounds yet — tune below, then Save editor.</p>
      <ul v-else class="library">
        <li v-for="v in library" :key="v.id" class="library-item">
          <div class="library-copy">
            <span class="library-title">{{ v.label }}</span>
            <span v-if="activeVoice.id === v.id && customActive" class="badge">Your default</span>
          </div>
          <div class="row-actions tight">
            <button type="button" class="btn btn-ghost" @click="playSource = v.id">Hear</button>
            <button type="button" class="btn btn-ghost" @click="loadSaved(v)">Edit</button>
            <button type="button" class="btn btn-ghost" @click="setAsMyPitchSound(v)">
              Set default
            </button>
            <button
              type="button"
              class="btn btn-ghost"
              :aria-label="`Delete ${v.label}`"
              @click="deleteSaved(v.id)"
            >
              Delete
            </button>
          </div>
        </li>
      </ul>
    </section>

    <section class="card" aria-labelledby="edit-h">
      <h2 id="edit-h" class="card-title">Editor</h2>
      <label class="field">
        <span class="lbl">Name</span>
        <input v-model="voice.label" type="text" maxlength="80" placeholder="e.g. Warm reed" />
      </label>

      <h3 class="subhead">Envelope &amp; level</h3>
      <label class="slider">
        <span class="lbl">Master gain <strong>{{ voice.masterGain.toFixed(2) }}</strong></span>
        <input v-model.number="voice.masterGain" type="range" min="0.05" max="0.8" step="0.01" />
      </label>
      <label class="slider">
        <span class="lbl">Attack <strong>{{ voice.attackSec.toFixed(3) }}s</strong></span>
        <input v-model.number="voice.attackSec" type="range" min="0.005" max="0.5" step="0.005" />
      </label>
      <label class="slider">
        <span class="lbl">Release <strong>{{ voice.releaseSec.toFixed(2) }}s</strong></span>
        <input v-model.number="voice.releaseSec" type="range" min="0.05" max="3" step="0.05" />
      </label>

      <div class="card-head">
        <h3 class="subhead">Partials / waveforms</h3>
        <button
          type="button"
          class="btn btn-ghost"
          :disabled="voice.partials.length >= 6"
          @click="addPartial"
        >
          Add
        </button>
      </div>
      <div v-for="(p, i) in voice.partials" :key="i" class="partial">
        <div class="partial-top">
          <span class="partial-idx">#{{ i + 1 }}</span>
          <select
            :value="p.type"
            :aria-label="`Partial ${i + 1} waveform`"
            @change="onWaveChange(i, $event)"
          >
            <option v-for="w in PITCH_PIPE_WAVEFORM_OPTIONS" :key="w.value" :value="w.value">
              {{ w.label }}
            </option>
          </select>
          <button
            type="button"
            class="btn btn-ghost"
            :disabled="voice.partials.length <= 1"
            :aria-label="`Remove partial ${i + 1}`"
            @click="removePartial(i)"
          >
            Remove
          </button>
        </div>
        <label class="slider">
          <span class="lbl">Gain <strong>{{ p.gain.toFixed(2) }}</strong></span>
          <input v-model.number="p.gain" type="range" min="0" max="1" step="0.01" />
        </label>
        <label class="slider">
          <span class="lbl">Semitones <strong>{{ p.semitones }}</strong></span>
          <input v-model.number="p.semitones" type="range" min="-24" max="24" step="1" />
        </label>
        <label class="slider">
          <span class="lbl">Detune <strong>{{ p.detuneCents }}¢</strong></span>
          <input v-model.number="p.detuneCents" type="range" min="-50" max="50" step="1" />
        </label>
      </div>

      <h3 class="subhead">Filter</h3>
      <label class="sustain">
        <input v-model="filterEnabled" type="checkbox" />
        Enable filter
      </label>
      <template v-if="voice.filter">
        <label class="field">
          <span class="lbl">Type</span>
          <select v-model="voice.filter.type">
            <option v-for="t in PITCH_PIPE_FILTER_TYPE_OPTIONS" :key="t.value" :value="t.value">
              {{ t.label }}
            </option>
          </select>
        </label>
        <label class="slider">
          <span class="lbl"
            >Frequency <strong>{{ Math.round(voice.filter.frequencyHz) }} Hz</strong></span
          >
          <input
            v-model.number="voice.filter.frequencyHz"
            type="range"
            min="80"
            max="12000"
            step="10"
          />
        </label>
        <label class="slider">
          <span class="lbl">Q <strong>{{ voice.filter.Q.toFixed(2) }}</strong></span>
          <input v-model.number="voice.filter.Q" type="range" min="0.1" max="12" step="0.05" />
        </label>
      </template>
    </section>

    <section class="card" aria-labelledby="share-h">
      <h2 id="share-h" class="card-title">Share a candidate default</h2>
      <p class="hint">
        If you land on a sound you think should ship as a built-in SingTags pitch-pipe option, email
        Krys the JSON (schema <code>singtags.pitchPipeVoice.v1</code>).
      </p>
      <div class="row-actions">
        <a class="btn btn-primary" :href="shareMailto">Email Krys this sound</a>
        <button type="button" class="btn" @click="copyExport">Copy JSON</button>
      </div>
      <p class="hint">
        Or write
        <a href="mailto:info@singtags.com">info@singtags.com</a>
        and paste the export below.
      </p>
      <textarea class="export" readonly :value="exportJson" rows="14" aria-label="Voice export JSON" />
    </section>

    <section class="card" aria-labelledby="import-h">
      <h2 id="import-h" class="card-title">Import JSON</h2>
      <label class="field">
        <span class="lbl">Paste a voice export</span>
        <textarea
          v-model="importText"
          rows="4"
          placeholder='{ "schema": "singtags.pitchPipeVoice.v1", "label": "…", "partials": […] }'
        />
      </label>
      <div class="row-actions">
        <button type="button" class="btn" :disabled="!importText.trim()" @click="applyImport">
          Load into editor
        </button>
      </div>
      <p v-if="importError" class="err" role="alert">{{ importError }}</p>
    </section>

    <p v-if="statusMsg" class="status" role="status">{{ statusMsg }}</p>
  </section>
</template>

<style scoped>
.lab {
  display: grid;
  gap: 1rem;
  width: 100%;
  max-width: 40rem;
  margin: 0 auto;
  padding: 0.25rem 0 2.5rem;
}
.head {
  display: grid;
  gap: 0.35rem;
}
.back {
  justify-self: start;
}
.title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 750;
  letter-spacing: -0.02em;
}
.intro {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
}
.card {
  display: grid;
  gap: 0.65rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius, 10px);
  background: var(--surface);
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.card-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}
.subhead {
  margin: 0.35rem 0 0;
  font-size: 0.95rem;
  font-weight: 700;
}
.notes {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.4rem;
}
@media (min-width: 520px) {
  .notes {
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }
}
.note {
  min-height: 2.85rem;
  padding: 0.35rem 0.25rem;
  border-radius: 10px;
  border: 2px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
  color: var(--text);
}
.note.black {
  background: color-mix(in srgb, var(--text) 12%, var(--surface));
}
.note.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.sustain {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.92rem;
}
.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}
.row-actions.tight {
  gap: 0.25rem;
}
.field,
.slider {
  display: grid;
  gap: 0.3rem;
}
.lbl {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--muted);
}
.lbl strong {
  color: var(--accent);
  font-weight: 700;
  margin-left: 0.25rem;
}
.field input,
.field select,
.field textarea,
.partial select,
.export {
  font: inherit;
  width: 100%;
  box-sizing: border-box;
  padding: 0.4rem 0.55rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 92%, #fff);
  color: var(--text);
}
.slider input[type='range'] {
  width: 100%;
  accent-color: var(--accent);
}
.partial {
  display: grid;
  gap: 0.45rem;
  padding: 0.65rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--border) 18%, var(--surface));
}
.partial-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}
.partial-idx {
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--muted);
}
.partial select {
  flex: 1 1 8rem;
  width: auto;
}
.hint {
  margin: 0;
  font-size: 0.88rem;
  color: var(--muted);
  line-height: 1.4;
}
.hint code {
  font-size: 0.82em;
}
.hint a {
  color: var(--accent-hover, var(--accent));
}
.export {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.78rem;
  line-height: 1.35;
  min-height: 11rem;
  resize: vertical;
}
.status {
  position: sticky;
  bottom: 4.5rem;
  margin: 0;
  padding: 0.65rem 0.85rem;
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text);
}
.err {
  margin: 0;
  color: var(--danger, #b33);
  font-size: 0.9rem;
}
.library {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}
.library-item {
  display: grid;
  gap: 0.35rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.library-copy {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem;
}
.library-title {
  font-weight: 700;
}
.badge {
  font-size: 0.75rem;
  font-weight: 650;
  color: var(--accent);
}
</style>
