<script setup lang="ts">
/**
 * Tag Studio chrome: modes + edit strip. Tools wrap onto a second line when needed.
 * Transport / mixer / sound live on the persistent media bar.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  DURATION_GLYPH_SVG,
  DURATION_GLYPH_VIEWBOX,
  type DurationGlyphId,
} from '../../lib/tagRoll/durationGlyphs'
import {
  nearestDurationId,
  TAG_ROLL_DURATION_PRESETS,
} from '../../lib/tagRoll/snap'
import {
  TAG_ROLL_PPQ,
  TAG_ROLL_TIME_SIGNATURE_PRESETS,
  type TagRollEditorMode,
} from '../../lib/tagRoll/types'
import {
  MAJOR_KEY_CHOICES,
  majorKeyChoiceById,
  majorKeyChoiceId,
} from '../../lib/tagRoll/keySignature'
import { tagRollTip, tipByShortcutId } from '../../lib/tagRoll/shortcuts'
import { useTagRollStore } from '../../stores/tagRoll'

const emit = defineEmits<{
  hearStack: []
  exportMidi: [mode: 'one' | 'two' | 'all']
  exportMusicXml: []
  exportAudio: [kind: 'mix' | 'parts' | 'partLeft']
  saveLibrary: []
  openHarmonize: []
  showShortcuts: []
}>()

const store = useTagRollStore()
const exportOpen = ref(false)

const project = computed(() => store.current)
const mode = computed(() => project.value?.view.mode ?? 'compose')
const isView = computed(() => mode.value === 'view')
const selectedNote = computed(() => store.selectedNote)

const MODES: { id: TagRollEditorMode; label: string }[] = [
  { id: 'view', label: 'View' },
  { id: 'compose', label: 'Compose' },
  { id: 'lyrics', label: 'Lyrics' },
]

const SNAP_PRESETS = [
  { id: 'quarter', label: 'Quarter', ticks: TAG_ROLL_PPQ },
  { id: 'eighth', label: 'Eighth', ticks: TAG_ROLL_PPQ / 2 },
  { id: 'sixteenth', label: 'Sixteenth', ticks: TAG_ROLL_PPQ / 4 },
  { id: 'thirty-second', label: '32nd', ticks: TAG_ROLL_PPQ / 8 },
  { id: 'eighth-triplet', label: 'Eighth triplet', ticks: Math.round(TAG_ROLL_PPQ / 3) },
] as const

const activeDurationId = computed(() => {
  if (selectedNote.value) return nearestDurationId(selectedNote.value.durationTicks)
  return nearestDurationId(store.addDurationTicks)
})

function glyphSvg(id: string): string {
  return DURATION_GLYPH_SVG[id as DurationGlyphId] ?? ''
}

function setDuration(id: string): void {
  const preset = TAG_ROLL_DURATION_PRESETS.find((p) => p.id === id)
  if (!preset) return
  store.addDurationTicks = preset.ticks
  if (store.selectedNoteIds.length) {
    store.pushHistoryCheckpoint()
    for (const noteId of store.selectedNoteIds) {
      store.updateNoteLive(noteId, { durationTicks: preset.ticks })
    }
  }
}

function onMode(m: TagRollEditorMode): void {
  store.setMode(m)
}

function onDelete(): void {
  const exprId = store.selectedExpressionId
  if (exprId) {
    const marker = project.value?.tempoMarkers.find((m) => m.id === exprId)
    if (marker?.tick === 0) return
    if (marker) store.deleteTempoMarker(exprId)
    else store.deleteExpression(exprId)
    return
  }
  if (store.selectedNoteIds.length) store.deleteSelectedNotes()
}

function onBpm(e: Event): void {
  const v = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(v)) store.setBpm(v)
}

function onSnap(e: Event): void {
  const v = Number((e.target as HTMLSelectElement).value)
  if (Number.isFinite(v)) store.setSnapTicks(v)
}

function onMeter(e: Event): void {
  const raw = (e.target as HTMLSelectElement).value
  const [n, d] = raw.split('/').map(Number)
  if (n && d) store.setTimeSignature({ numerator: n, denominator: d })
}

function onClefFamily(e: Event): void {
  const v = (e.target as HTMLSelectElement).value
  store.setClefFamily(v === 'ssaa' ? 'ssaa' : 'ttbb')
}

function onSheetKey(e: Event): void {
  const choice = majorKeyChoiceById((e.target as HTMLSelectElement).value)
  if (choice) store.setTonality(choice.tonality, choice.preferFlats)
}

function onScoreSurface(surface: 'roll' | 'sheet'): void {
  store.setScoreSurface(surface)
}

function onSheetShowLyrics(e: Event): void {
  store.setSheetShowLyrics((e.target as HTMLInputElement).checked)
}

function onExport(mode: 'one' | 'two' | 'all'): void {
  exportOpen.value = false
  emit('exportMidi', mode)
}

function onExportMusicXml(): void {
  exportOpen.value = false
  emit('exportMusicXml')
}

function onExportAudio(kind: 'mix' | 'parts' | 'partLeft'): void {
  exportOpen.value = false
  emit('exportAudio', kind)
}

function onSaveLibrary(): void {
  exportOpen.value = false
  emit('saveLibrary')
}

const meterValue = computed(() => {
  const ts = project.value?.timeSignature
  return ts ? `${ts.numerator}/${ts.denominator}` : '4/4'
})

function durationTip(label: string, index: number): string {
  return tipByShortcutId(`dur-${index + 1}`, `${label} note`)
}

function modeTip(id: TagRollEditorMode, label: string): string {
  if (id === 'view') return tipByShortcutId('mode-view', label)
  if (id === 'compose') return tipByShortcutId('mode-compose', label)
  return tipByShortcutId('mode-lyrics', label)
}

function onDocPointer(e: PointerEvent): void {
  if (!exportOpen.value) return
  const el = e.target as HTMLElement | null
  if (el?.closest?.('.export-wrap')) return
  exportOpen.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer, true)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointer, true)
})
</script>

<template>
  <div v-if="project" class="tr-tb" role="toolbar" aria-label="Tag Studio tools">
    <div class="row primary-row">
      <div class="modes segment" role="group" aria-label="Editor mode">
        <button
          v-for="m in MODES"
          :key="m.id"
          type="button"
          class="seg-btn"
          :class="{ on: mode === m.id }"
          :aria-pressed="mode === m.id"
          :title="modeTip(m.id, m.label)"
          @click="onMode(m.id)"
        >
          {{ m.label }}
        </button>
      </div>

      <div class="sep" aria-hidden="true" />

      <div
        v-if="!isView"
        class="modes segment"
        role="group"
        aria-label="Pointer tool"
      >
        <button
          type="button"
          class="seg-btn ico"
          :class="{ on: store.pointerTool !== 'pan' }"
          :aria-pressed="store.pointerTool !== 'pan'"
          :title="tipByShortcutId('pointer-edit', 'Edit')"
          aria-label="Edit pointer"
          @click="store.setPointerTool('edit')"
        >
          <font-awesome-icon :icon="['fas', 'arrow-pointer']" class="tr-ico" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="seg-btn ico"
          :class="{ on: store.pointerTool === 'pan' }"
          :aria-pressed="store.pointerTool === 'pan'"
          :title="tipByShortcutId('pointer-pan', 'Hand')"
          aria-label="Hand tool — pan the grid"
          @click="store.setPointerTool('pan')"
        >
          <font-awesome-icon :icon="['fas', 'hand']" class="tr-ico" aria-hidden="true" />
        </button>
      </div>

      <div
        v-if="mode === 'view'"
        class="modes segment"
        role="group"
        aria-label="View surface"
      >
        <button
          type="button"
          class="seg-btn"
          :class="{ on: project.view.scoreSurface !== 'sheet' }"
          :aria-pressed="project.view.scoreSurface !== 'sheet'"
          :title="tagRollTip('Read-only piano roll')"
          @click="onScoreSurface('roll')"
        >
          Roll
        </button>
        <button
          type="button"
          class="seg-btn"
          :class="{ on: project.view.scoreSurface === 'sheet' }"
          :aria-pressed="project.view.scoreSurface === 'sheet'"
          :title="tagRollTip('Engraved sheet music')"
          @click="onScoreSurface('sheet')"
        >
          Sheet
        </button>
      </div>

      <label
        v-if="isView && project.view.scoreSurface === 'sheet'"
        class="chk"
        :title="tagRollTip('Show stacked lyrics under each staff')"
      >
        <input
          type="checkbox"
          :checked="project.view.sheetShowLyrics !== false"
          aria-label="Show sheet lyrics"
          @change="onSheetShowLyrics"
        />
        <span>Lyrics</span>
      </label>

      <label
        v-if="!isView"
        class="field"
        :title="tagRollTip('Men’s TTBB (treble 8vb) or women’s SSAA (bass 8va) clefs')"
      >
        <span class="lbl">Clefs</span>
        <select
          class="sel"
          :value="project.clefFamily"
          aria-label="Barbershop clef family"
          @change="onClefFamily"
        >
          <option value="ttbb">Men’s (TTBB)</option>
          <option value="ssaa">Women’s (SSAA)</option>
        </select>
      </label>

      <label
        v-if="!isView"
        class="field"
        :title="tagRollTip('Concert key — engraved key signature')"
      >
        <span class="lbl">Key</span>
        <select
          class="sel"
          :value="majorKeyChoiceId(project.tonality, project.preferFlats)"
          aria-label="Key signature"
          @change="onSheetKey"
        >
          <option v-for="k in MAJOR_KEY_CHOICES" :key="k.id" :value="k.id">
            {{ k.id }}
          </option>
        </select>
      </label>

      <template v-if="!isView">
        <div class="sep" aria-hidden="true" />

        <div class="dur-group" role="group" aria-label="Note length">
          <span class="lbl">Len</span>
          <button
            v-for="(p, i) in TAG_ROLL_DURATION_PRESETS"
            :key="p.id"
            type="button"
            class="btn sm dur-btn"
            :class="{ on: activeDurationId === p.id }"
            :title="durationTip(p.label, i)"
            :aria-label="`${p.label} note`"
            @click="setDuration(p.id)"
          >
            <span
              class="dur-glyph"
              aria-hidden="true"
              v-html="`<svg viewBox='${DURATION_GLYPH_VIEWBOX}'>${glyphSvg(p.id)}</svg>`"
            />
          </button>
        </div>

        <label class="field" :title="tagRollTip('Grid snap for placing and moving notes')">
          <span class="lbl">Grid</span>
          <select
            class="sel"
            :value="project.snapTicks"
            aria-label="Grid snap"
            @change="onSnap"
          >
            <option v-for="s in SNAP_PRESETS" :key="s.id" :value="s.ticks">
              {{ s.label }}
            </option>
          </select>
        </label>

        <button
          type="button"
          class="btn sm"
          :title="tipByShortcutId('undo')"
          :disabled="!store.canUndo"
          @click="store.undo()"
        >
          Undo
        </button>
        <button
          type="button"
          class="btn sm"
          :title="tipByShortcutId('redo')"
          :disabled="!store.canRedo"
          @click="store.redo()"
        >
          Redo
        </button>

        <button
          v-if="store.selectedNoteIds.length || store.selectedExpressionId"
          type="button"
          class="btn danger sm"
          :title="tipByShortcutId('delete', store.selectedNoteIds.length > 1 ? 'Delete selected notes' : 'Delete')"
          @click="onDelete"
        >
          Delete{{ store.selectedNoteIds.length > 1 ? ` (${store.selectedNoteIds.length})` : '' }}
        </button>

        <div class="sep" aria-hidden="true" />

        <label class="field" :title="tagRollTip('Time signature')">
          <span class="lbl">Meter</span>
          <select class="sel" :value="meterValue" aria-label="Time signature" @change="onMeter">
            <option
              v-for="ts in TAG_ROLL_TIME_SIGNATURE_PRESETS"
              :key="`${ts.numerator}/${ts.denominator}`"
              :value="`${ts.numerator}/${ts.denominator}`"
            >
              {{ ts.numerator }}/{{ ts.denominator }}
            </option>
          </select>
        </label>

        <label class="field" :title="tagRollTip('Starting tempo (marker at beat 1)')">
          <span class="lbl">BPM</span>
          <input
            class="num"
            type="number"
            min="20"
            max="320"
            :value="project.bpm"
            aria-label="Starting tempo BPM"
            @change="onBpm"
          />
        </label>

        <label class="inline-check" :title="tagRollTip('Lock piano tote scroll')">
          <input
            type="checkbox"
            :checked="project.view.lockPiano"
            @change="store.setLockPiano(($event.target as HTMLInputElement).checked)"
          />
          Lock piano
        </label>
      </template>

      <div class="sep" aria-hidden="true" />

      <button
        type="button"
        class="btn sm"
        :title="tipByShortcutId('hear-stack', 'Hear stack')"
        @click="emit('hearStack')"
      >
        Hear stack
      </button>

      <button
        v-if="!isView"
        type="button"
        class="btn sm"
        :title="tipByShortcutId('harmonize', 'Harmonize')"
        @click="emit('openHarmonize')"
      >
        Harmonize
      </button>

      <div v-if="!isView" class="bar-edit" role="group" aria-label="Measures">
        <button
          type="button"
          class="btn sm"
          :title="tagRollTip('Remove one measure from the end')"
          :disabled="!store.canShrinkMeasures()"
          @click="store.shrinkMeasures(1)"
        >
          −1 bar
        </button>
        <button
          type="button"
          class="btn sm"
          :title="tagRollTip('Extend project by one measure')"
          @click="store.extendMeasures(1)"
        >
          +1 bar
        </button>
        <button
          type="button"
          class="btn sm"
          :title="tagRollTip('Insert empty measure before the cursor bar')"
          @click="store.insertMeasure('before')"
        >
          Insert before
        </button>
        <button
          type="button"
          class="btn sm"
          :title="tagRollTip('Insert empty measure after the cursor bar')"
          @click="store.insertMeasure('after')"
        >
          Insert after
        </button>
      </div>

      <div class="export-wrap">
        <button
          type="button"
          class="btn sm"
          :title="tagRollTip('Export MIDI, MusicXML, MP3, or save to My Library')"
          :aria-expanded="exportOpen"
          @click="exportOpen = !exportOpen"
        >
          Export ▾
        </button>
        <div v-if="exportOpen" class="menu export-menu-pop" role="menu">
          <button type="button" role="menuitem" @click="onExport('one')">MIDI · 1 track</button>
          <button type="button" role="menuitem" @click="onExport('two')">MIDI · 2 tracks</button>
          <button type="button" role="menuitem" @click="onExport('all')">MIDI · all parts</button>
          <button type="button" role="menuitem" @click="onExportMusicXml">MusicXML</button>
          <button type="button" role="menuitem" @click="onExportAudio('mix')">MP3 · mix</button>
          <button type="button" role="menuitem" @click="onExportAudio('parts')">MP3 · parts</button>
          <button type="button" role="menuitem" @click="onExportAudio('partLeft')">
            MP3 · part-left
          </button>
          <button type="button" role="menuitem" @click="onSaveLibrary">Save to My Library</button>
        </div>
      </div>

      <button
        type="button"
        class="btn sm ghost"
        :title="tipByShortcutId('shortcuts', 'Keyboard shortcuts overview')"
        @click="emit('showShortcuts')"
      >
        ?
      </button>
    </div>
  </div>
</template>

<style scoped>
.tr-tb {
  display: grid;
  gap: 0.35rem;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.5rem;
  min-width: 0;
}
.primary-row {
  padding: 0.35rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface) 88%, var(--bg, var(--surface)));
}
.sep {
  width: 1px;
  align-self: stretch;
  min-height: 1.6rem;
  background: var(--border);
  margin: 0 0.05rem;
  flex: 0 0 auto;
}
.field {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  flex: 0 0 auto;
  white-space: nowrap;
}
.chk {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.84rem;
  color: var(--text);
  white-space: nowrap;
  flex: 0 0 auto;
  cursor: pointer;
  user-select: none;
}
.chk input {
  margin: 0;
}
.inline-check {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.84rem;
  color: var(--text);
  white-space: nowrap;
  flex: 0 0 auto;
  cursor: pointer;
}
.dur-group {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  flex: 0 0 auto;
}
.bar-edit {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  flex: 0 0 auto;
}
.dur-btn {
  min-width: 1.7rem;
  min-height: 30px;
  padding: 0.1rem 0.22rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.dur-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
  line-height: 0;
  opacity: 0.92;
}
.dur-glyph :deep(svg) {
  display: block;
  width: 0.82rem;
  height: 1.28rem;
}
.segment {
  display: inline-flex;
  padding: 0.15rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg, var(--surface)) 65%, var(--surface));
  gap: 0.1rem;
  flex: 0 0 auto;
}
.seg-btn {
  min-height: 32px;
  padding: 0.18rem 0.65rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.84rem;
  font-weight: 650;
  cursor: pointer;
}
.seg-btn.on {
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 1px 3px color-mix(in srgb, #000 10%, transparent);
}
.seg-btn.ico {
  min-width: 2.1rem;
  padding: 0.18rem 0.45rem;
}
.tr-ico {
  width: 0.95rem;
  height: 0.95rem;
}
.lbl {
  font-size: 0.68rem;
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
.export-wrap {
  position: relative;
  flex: 0 0 auto;
}
.menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 30;
  min-width: 13rem;
  display: grid;
  padding: 0.25rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 8px 24px color-mix(in srgb, #000 12%, transparent);
}
.export-menu-pop {
  min-width: 12rem;
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
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.btn {
  min-height: 34px;
  padding: 0.25rem 0.55rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.88rem;
  cursor: pointer;
  flex: 0 0 auto;
  white-space: nowrap;
}
.btn.sm {
  min-height: 32px;
  padding: 0.18rem 0.45rem;
  font-size: 0.84rem;
}
.btn.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
}
.btn.ghost {
  background: transparent;
}
.btn.danger {
  border-color: color-mix(in srgb, #b91c1c 50%, var(--border));
  color: #b91c1c;
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
