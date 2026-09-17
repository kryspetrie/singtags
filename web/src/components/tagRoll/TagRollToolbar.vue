<script setup lang="ts">
/**
 * Tag Roll chrome: modes, transport, parts chips, export, grid size.
 */
import { computed, ref } from 'vue'
import { PIANO_SAMPLE_ENGINE_OPTIONS } from '../../audio/pianoSamples'
import {
  nearestDurationId,
  TAG_ROLL_DURATION_PRESETS,
} from '../../lib/tagRoll/snap'
import type { TagRollEditorMode } from '../../lib/tagRoll/types'
import { useTagRollStore } from '../../stores/tagRoll'

const emit = defineEmits<{
  play: []
  pause: []
  stop: []
  hearStack: []
  exportMidi: [mode: 'one' | 'two' | 'all']
  saveLibrary: []
  openHarmonize: []
  parts: []
}>()

const store = useTagRollStore()
const exportOpen = ref(false)

const project = computed(() => store.current)
const mode = computed(() => project.value?.view.mode ?? 'view')
const selectedNote = computed(() => store.selectedNote)

const MODES: { id: TagRollEditorMode; label: string }[] = [
  { id: 'view', label: 'View' },
  { id: 'add', label: 'Add' },
  { id: 'edit', label: 'Edit' },
  { id: 'lyrics', label: 'Lyrics' },
]

const addDurationId = computed({
  get: () => nearestDurationId(store.addDurationTicks),
  set: (id: string) => {
    const preset = TAG_ROLL_DURATION_PRESETS.find((p) => p.id === id)
    if (preset) store.addDurationTicks = preset.ticks
  },
})

const editDurationId = computed({
  get: () => {
    const n = selectedNote.value
    return n ? nearestDurationId(n.durationTicks) : 'quarter'
  },
  set: (id: string) => {
    const n = selectedNote.value
    const preset = TAG_ROLL_DURATION_PRESETS.find((p) => p.id === id)
    if (n && preset) store.updateNote(n.id, { durationTicks: preset.ticks })
  },
})

function onMode(m: TagRollEditorMode): void {
  store.setMode(m)
}

function onReturnToZero(): void {
  store.setPlayheadTick(0)
}

function onPlayPause(): void {
  if (store.transportPlaying) {
    store.transportPlaying = false
    emit('pause')
  } else {
    store.transportPlaying = true
    emit('play')
  }
}

function onStop(): void {
  store.transportPlaying = false
  emit('stop')
}

function onDelete(): void {
  const n = selectedNote.value
  if (n) store.deleteNote(n.id)
}

function onBpm(e: Event): void {
  const v = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(v)) store.setBpm(v)
}

function onSound(e: Event): void {
  const v = (e.target as HTMLSelectElement).value
  if (v === 'synth' || v === 'samples') store.setSoundEngine(v)
}

function onExport(mode: 'one' | 'two' | 'all'): void {
  exportOpen.value = false
  emit('exportMidi', mode)
}

function onSaveLibrary(): void {
  exportOpen.value = false
  emit('saveLibrary')
}
</script>

<template>
  <div v-if="project" class="tr-tb" role="toolbar" aria-label="Tag Roll tools">
    <div class="row">
      <label class="field">
        <span class="lbl">Mode</span>
        <select
          class="sel"
          :value="mode"
          aria-label="Editor mode"
          @change="onMode(($event.target as HTMLSelectElement).value as TagRollEditorMode)"
        >
          <option v-for="m in MODES" :key="m.id" :value="m.id">{{ m.label }}</option>
        </select>
      </label>

      <label v-if="mode === 'add'" class="field">
        <span class="lbl">Dur</span>
        <select v-model="addDurationId" class="sel" aria-label="Default note duration">
          <option v-for="p in TAG_ROLL_DURATION_PRESETS" :key="p.id" :value="p.id">
            {{ p.label }}
          </option>
        </select>
      </label>

      <template v-if="mode === 'edit' && selectedNote">
        <label class="field">
          <span class="lbl">Dur</span>
          <select v-model="editDurationId" class="sel" aria-label="Selected note duration">
            <option v-for="p in TAG_ROLL_DURATION_PRESETS" :key="p.id" :value="p.id">
              {{ p.label }}
            </option>
          </select>
        </label>
        <button type="button" class="btn danger" @click="onDelete">Delete</button>
      </template>

      <div class="transport" role="group" aria-label="Transport">
        <button type="button" class="btn sm" title="Return to start" @click="onReturnToZero">
          ⏮
        </button>
        <button
          type="button"
          class="btn sm"
          :title="store.transportPlaying ? 'Pause' : 'Play'"
          @click="onPlayPause"
        >
          {{ store.transportPlaying ? '⏸' : '▶' }}
        </button>
        <button type="button" class="btn sm" title="Stop" @click="onStop">⏹</button>
      </div>

      <label class="field">
        <span class="lbl">BPM</span>
        <input
          class="num"
          type="number"
          min="40"
          max="240"
          :value="project.bpm"
          aria-label="Tempo BPM"
          @change="onBpm"
        />
      </label>

      <label class="field">
        <span class="lbl">Sound</span>
        <select
          class="sel"
          :value="project.soundEngine"
          aria-label="Sound engine"
          @change="onSound"
        >
          <option
            v-for="o in PIANO_SAMPLE_ENGINE_OPTIONS"
            :key="o.value"
            :value="o.value"
          >
            {{ o.label }}
          </option>
        </select>
      </label>
    </div>

    <div class="row">
      <div class="parts" role="group" aria-label="Active part">
        <button
          v-for="part in project.parts"
          :key="part.id"
          type="button"
          class="chip"
          :class="{ on: project.view.activePartId === part.id }"
          :style="{ '--part': part.color }"
          @click="store.setActivePart(part.id)"
        >
          {{ part.name }}
        </button>
        <button type="button" class="btn sm" title="Edit parts" @click="emit('parts')">
          Parts
        </button>
      </div>

      <div class="actions">
        <div class="export-wrap">
          <button
            type="button"
            class="btn"
            :aria-expanded="exportOpen"
            @click="exportOpen = !exportOpen"
          >
            Export ▾
          </button>
          <div v-if="exportOpen" class="menu" role="menu">
            <button type="button" role="menuitem" @click="onExport('one')">MIDI · 1 track</button>
            <button type="button" role="menuitem" @click="onExport('two')">MIDI · 2 tracks</button>
            <button type="button" role="menuitem" @click="onExport('all')">MIDI · all parts</button>
            <button type="button" role="menuitem" @click="onSaveLibrary">Save to My Library</button>
          </div>
        </div>
        <button type="button" class="btn" @click="emit('hearStack')">Hear stack</button>
        <button type="button" class="btn" @click="emit('openHarmonize')">Harmonize</button>
        <button type="button" class="btn" @click="store.extendMeasures(1)">+1 measure</button>
      </div>

      <div class="grid-size" role="group" aria-label="Grid size">
        <span class="lbl">W</span>
        <button type="button" class="btn sm" aria-label="Narrower cells" @click="store.nudgeCellW(-2)">
          −
        </button>
        <button type="button" class="btn sm" aria-label="Wider cells" @click="store.nudgeCellW(2)">
          +
        </button>
        <span class="lbl">H</span>
        <button type="button" class="btn sm" aria-label="Shorter cells" @click="store.nudgeCellH(-1)">
          −
        </button>
        <button type="button" class="btn sm" aria-label="Taller cells" @click="store.nudgeCellH(1)">
          +
        </button>
        <label class="lock">
          <input
            type="checkbox"
            :checked="project.view.lockPiano"
            @change="store.setLockPiano(($event.target as HTMLInputElement).checked)"
          />
          Lock piano
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tr-tb {
  display: grid;
  gap: 0.45rem;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
.field {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.lbl {
  font-size: 0.72rem;
  font-weight: 650;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.sel,
.num {
  min-height: 34px;
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.9rem;
}
.num {
  width: 4.2rem;
}
.transport {
  display: inline-flex;
  gap: 0.2rem;
  margin-left: 0.15rem;
}
.parts {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
}
.chip {
  min-height: 32px;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--part, var(--border)) 55%, var(--border));
  background: color-mix(in srgb, var(--part, var(--surface)) 18%, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.chip.on {
  border-color: var(--part, var(--accent));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--part, var(--accent)) 40%, transparent);
  background: color-mix(in srgb, var(--part, var(--accent)) 28%, var(--surface));
}
.actions {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  margin-left: auto;
}
.export-wrap {
  position: relative;
}
.menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 20;
  min-width: 11rem;
  display: grid;
  padding: 0.25rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 8px 24px color-mix(in srgb, #000 12%, transparent);
}
.menu button {
  text-align: left;
  min-height: 36px;
  padding: 0.35rem 0.55rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 0.9rem;
  cursor: pointer;
}
.menu button:hover {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
}
.grid-size {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
}
.lock {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-left: 0.35rem;
  font-size: 0.85rem;
  font-weight: 550;
  cursor: pointer;
  user-select: none;
}
.btn {
  min-height: 34px;
  min-width: 34px;
  padding: 0.2rem 0.55rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 650;
  font-size: 0.88rem;
  cursor: pointer;
}
.btn.sm {
  min-height: 32px;
  min-width: 32px;
  padding: 0.15rem 0.4rem;
}
.btn.danger {
  color: var(--danger, #b42318);
  border-color: color-mix(in srgb, var(--danger, #b42318) 35%, var(--border));
}
</style>
