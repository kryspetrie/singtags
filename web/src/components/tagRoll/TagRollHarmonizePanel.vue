<script setup lang="ts">
/**
 * Melody-anchored barbershop chord entry.
 * Clicking a chord/voicing applies immediately; Cancel undoes the last apply.
 * UX/algorithm inspired by znarf94/MuseScore_Barbershop_Harmonizer (reimplemented; not QML).
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { midiToNote } from '../../audio/pianoSamples'
import { createPitchTonePlayer, type PitchTonePlayer } from '../../audio/pitchTone'
import { resolvePitchPipeVoiceById } from '../../audio/pitchPipeVoice'
import { useTagRollAudio } from '../../composables/useTagRollAudio'
import {
  BARBERSHOP_CHORDS,
  chordContainsLead,
  leadRoleInChord,
  placeVoicingConcert,
  pcName,
  ROOT_OFFSETS,
  VOICINGS_BY_CHORD,
  voicingFitsLead,
  type BarbershopChordNature,
  type VoicingPitches,
} from '../../lib/tagRoll/harmonizer/chords'
import { notesAtTick } from '../../lib/tagRoll/notesAtTick'
import { tagRollTip, tipByShortcutId } from '../../lib/tagRoll/shortcuts'
import type { TagRollNote } from '../../lib/tagRoll/types'
import { useTagRollStore } from '../../stores/tagRoll'

export type TagRollGhostNote = {
  role: 'tenor' | 'bari' | 'bass'
  midi: number
  startTick: number
  durationTicks: number
  color: string
}

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  previewGhost: [ghosts: TagRollGhostNote[]]
  clearGhost: []
  stepMelody: [direction: -1 | 1]
}>()

const store = useTagRollStore()
const rootOffset = ref(0)
const chordId = ref<string | null>(null)
const voicing = ref<string | null>(null)
const spread = ref(false)
const appliedCount = ref(0)

const panelRef = ref<HTMLElement | null>(null)
const pos = ref({ x: 0, y: 0 })
const positioned = ref(false)
let drag:
  | {
      pointerId: number
      startX: number
      startY: number
      origX: number
      origY: number
    }
  | null = null

const PANEL_W = 340
const PANEL_MARGIN = 12

function clampPos(x: number, y: number): { x: number; y: number } {
  const el = panelRef.value
  const w = el?.offsetWidth || PANEL_W
  const h = el?.offsetHeight || 360
  const maxX = Math.max(PANEL_MARGIN, window.innerWidth - w - PANEL_MARGIN)
  const maxY = Math.max(PANEL_MARGIN, window.innerHeight - Math.min(h, window.innerHeight - PANEL_MARGIN * 2) - PANEL_MARGIN)
  return {
    x: Math.min(maxX, Math.max(PANEL_MARGIN, x)),
    y: Math.min(maxY, Math.max(PANEL_MARGIN, y)),
  }
}

/** Default: float against the right edge, below typical chrome. */
function placeDefaultRight(): void {
  const el = panelRef.value
  const w = el?.offsetWidth || PANEL_W
  pos.value = clampPos(window.innerWidth - w - PANEL_MARGIN, 72)
  positioned.value = true
}

function onDragPointerDown(e: PointerEvent): void {
  if (e.button !== 0) return
  const t = e.target as HTMLElement | null
  if (t?.closest('button, a, input, select, textarea, label')) return
  drag = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    origX: pos.value.x,
    origY: pos.value.y,
  }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  e.preventDefault()
}

function onDragPointerMove(e: PointerEvent): void {
  if (!drag || e.pointerId !== drag.pointerId) return
  pos.value = clampPos(
    drag.origX + (e.clientX - drag.startX),
    drag.origY + (e.clientY - drag.startY),
  )
}

function onDragPointerUp(e: PointerEvent): void {
  if (!drag || e.pointerId !== drag.pointerId) return
  drag = null
  try {
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  } catch {
    /* already released */
  }
}

function onWinResize(): void {
  if (!props.open || !positioned.value) return
  pos.value = clampPos(pos.value.x, pos.value.y)
}

const shared = useTagRollAudio()
let localPlayer: PitchTonePlayer | null = null
let stabTimer: ReturnType<typeof setTimeout> | null = null

const project = computed(() => store.current)

const melodyPartId = computed(() => {
  const p = project.value
  if (!p) return null
  return (
    p.view.melodyPartId ??
    p.parts.find((x) => x.name === 'Lead')?.id ??
    p.parts[0]?.id ??
    null
  )
})

const melodyPart = computed(
  () => project.value?.parts.find((p) => p.id === melodyPartId.value) ?? null,
)

const melodyNotesSorted = computed((): TagRollNote[] => {
  const p = project.value
  const mid = melodyPartId.value
  if (!p || !mid) return []
  return p.notes
    .filter((n) => n.partId === mid)
    .slice()
    .sort((a, b) => a.startTick - b.startTick || a.midi - b.midi)
})

const melodyNote = computed((): TagRollNote | null => {
  const p = project.value
  const mid = melodyPartId.value
  if (!p || !mid) return null
  const sel = store.selectedNote
  if (sel && sel.partId === mid) return sel
  const at = notesAtTick(p.notes, p.view.playheadTick).filter((n) => n.partId === mid)
  if (at.length) return at.slice().sort((a, b) => a.midi - b.midi)[0] ?? null
  // Nearest upcoming / previous melody note relative to playhead.
  const sorted = melodyNotesSorted.value
  if (!sorted.length) return null
  const tick = p.view.playheadTick
  const next = sorted.find((n) => n.startTick >= tick)
  if (next) return next
  return sorted[sorted.length - 1] ?? null
})

const melodyIndex = computed(() => {
  const note = melodyNote.value
  if (!note) return -1
  return melodyNotesSorted.value.findIndex((n) => n.id === note.id)
})

const rootPc = computed(() => {
  const tonality = project.value?.tonality ?? 0
  return (((tonality + rootOffset.value) % 12) + 12) % 12
})

const preferFlats = computed(() => project.value?.preferFlats ?? false)

const selectedChord = computed(
  (): BarbershopChordNature | null =>
    BARBERSHOP_CHORDS.find((c) => c.id === chordId.value) ?? null,
)

const availableChords = computed(() => {
  const mel = melodyNote.value
  if (!mel) return []
  return BARBERSHOP_CHORDS.filter((c) => chordContainsLead(c, rootPc.value, mel.midi))
})

const leadRole = computed(() => {
  const chord = selectedChord.value
  const mel = melodyNote.value
  if (!chord || !mel) return null
  return leadRoleInChord(chord, rootPc.value, mel.midi)
})

const availableVoicings = computed(() => {
  const chord = selectedChord.value
  const role = leadRole.value
  if (!chord || role == null) return []
  const list = VOICINGS_BY_CHORD[chord.id] ?? []
  return list.filter((v) => voicingFitsLead(v, role))
})

function ghostsFromPlaced(pitches: VoicingPitches, mel: TagRollNote): TagRollGhostNote[] {
  const parts = project.value?.parts ?? []
  const colorFor = (name: string, fallback: string) =>
    parts.find((p) => p.name === name)?.color ?? fallback
  return [
    {
      role: 'tenor',
      midi: pitches.tenor,
      startTick: mel.startTick,
      durationTicks: mel.durationTicks,
      color: colorFor('Tenor', '#c45c26'),
    },
    {
      role: 'bari',
      midi: pitches.bari,
      startTick: mel.startTick,
      durationTicks: mel.durationTicks,
      color: colorFor('Bari', '#2f7d4a'),
    },
    {
      role: 'bass',
      midi: pitches.bass,
      startTick: mel.startTick,
      durationTicks: mel.durationTicks,
      color: colorFor('Bass', '#5b3d8f'),
    },
  ]
}

function ensurePlayer(): PitchTonePlayer {
  if (shared) return shared.ensurePlayer()
  if (!localPlayer) {
    const engine = project.value?.soundEngine ?? 'synth'
    localPlayer = createPitchTonePlayer(engine, { polyphony: true })
  }
  if ((project.value?.soundEngine ?? 'synth') === 'synth') {
    localPlayer.setVoice(resolvePitchPipeVoiceById(project.value?.pitchPipeSoundId))
  }
  return localPlayer
}

function stopStab(): void {
  if (stabTimer) {
    clearTimeout(stabTimer)
    stabTimer = null
  }
  if (shared?.isTransportPlaying?.()) return
  if (shared) shared.allNotesOff(true)
  else localPlayer?.allNotesOff(true)
}

async function soundPitches(pitches: VoicingPitches): Promise<void> {
  if (shared?.isTransportPlaying?.()) return
  stopStab()
  const p = ensurePlayer()
  const notes = [pitches.bass, pitches.bari, pitches.lead, pitches.tenor].map((m) =>
    midiToNote(m),
  )
  await Promise.all(notes.map((n) => p.noteOn(n)))
  stabTimer = setTimeout(() => {
    stabTimer = null
    if (shared?.isTransportPlaying?.()) return
    if (shared) shared.allNotesOff(true)
    else p.allNotesOff(true)
  }, 700)
}

function onCancel(): void {
  if (appliedCount.value <= 0) return
  store.cancelLastEdit()
  appliedCount.value = Math.max(0, appliedCount.value - 1)
  emit('clearGhost')
  stopStab()
}

function onClose(): void {
  stopStab()
  emit('clearGhost')
  appliedCount.value = 0
  emit('close')
}

function selectRoot(offset: number): void {
  rootOffset.value = offset
  chordId.value = null
  voicing.value = null
}

function selectChord(id: string): void {
  const mel = melodyNote.value
  if (!mel) return
  chordId.value = id
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === id)
  if (!chord) return
  const role = leadRoleInChord(chord, rootPc.value, mel.midi)
  const list = (VOICINGS_BY_CHORD[id] ?? []).filter((v) =>
    role != null ? voicingFitsLead(v, role) : true,
  )
  voicing.value = list[0] ?? null
  commitHarmony()
}

function selectVoicing(v: string): void {
  voicing.value = v
  commitHarmony()
}

function setSpread(on: boolean): void {
  spread.value = on
  if (voicing.value) commitHarmony()
}

function commitHarmony(): void {
  const mel = melodyNote.value
  const chord = selectedChord.value
  const v = voicing.value
  if (!mel || !chord || !v) {
    emit('clearGhost')
    return
  }
  const pitches = placeVoicingConcert({
    chord,
    rootPc: rootPc.value,
    leadMidi: mel.midi,
    voicing: v,
    spread: spread.value,
    clefFamily: project.value?.clefFamily ?? 'ttbb',
    melodyStaff: melodyPart.value?.midiGroup ?? 'upper',
  })
  if (!pitches) return
  emit('previewGhost', ghostsFromPlaced(pitches, mel))
  store.upsertHarmonyNotes({
    melodyNoteId: mel.id,
    pitches,
  })
  appliedCount.value += 1
  emit('clearGhost')
  void soundPitches(pitches)
}

function onMelodyPartChange(e: Event): void {
  const id = (e.target as HTMLSelectElement).value
  store.setMelodyPart(id)
  chordId.value = null
  voicing.value = null
}

function step(dir: -1 | 1): void {
  const sorted = melodyNotesSorted.value
  if (!sorted.length) return
  const idx = melodyIndex.value
  const nextIdx =
    idx < 0
      ? dir > 0
        ? 0
        : sorted.length - 1
      : Math.max(0, Math.min(sorted.length - 1, idx + dir))
  const note = sorted[nextIdx]!
  store.selectNote(note.id)
  store.setPlayheadTick(note.startTick)
  chordId.value = null
  voicing.value = null
  emit('stepMelody', dir)
}

watch(
  () => props.open,
  async (on) => {
    if (!on) {
      emit('clearGhost')
      stopStab()
      appliedCount.value = 0
      return
    }
    if (chordId.value && !availableChords.value.some((c) => c.id === chordId.value)) {
      chordId.value = null
      voicing.value = null
    }
    await nextTick()
    if (!positioned.value) placeDefaultRight()
    else pos.value = clampPos(pos.value.x, pos.value.y)
  },
)

watch(availableChords, (list) => {
  if (chordId.value && !list.some((c) => c.id === chordId.value)) {
    chordId.value = null
    voicing.value = null
  }
})

watch(availableVoicings, (list) => {
  if (voicing.value && !list.includes(voicing.value)) {
    voicing.value = null
  }
})

onMounted(() => {
  window.addEventListener('resize', onWinResize)
  if (props.open) void nextTick(() => placeDefaultRight())
})

onUnmounted(() => {
  window.removeEventListener('resize', onWinResize)
  stopStab()
  localPlayer?.dispose()
  localPlayer = null
})

defineExpose({ step, onCancel })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="panelRef"
      class="tr-hz"
      role="complementary"
      aria-label="Harmonize"
      aria-modal="false"
      :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
    >
      <header
        class="head"
        title="Drag to move"
        @pointerdown="onDragPointerDown"
        @pointermove="onDragPointerMove"
        @pointerup="onDragPointerUp"
        @pointercancel="onDragPointerUp"
      >
        <h2 class="title">Harmonize</h2>
        <button
          type="button"
          class="btn ghost"
          :aria-label="tagRollTip('Close', 'Esc')"
          :title="tagRollTip('Close', 'Esc')"
          @click="onClose"
        >
          ✕
        </button>
      </header>

      <label class="field" :title="tagRollTip('Melody part for harmonizer')">
        <span class="lbl">Melody part</span>
        <select
          class="sel"
          :value="melodyPartId ?? ''"
          aria-label="Melody part for harmonizer"
          @change="onMelodyPartChange"
        >
          <option v-for="part in project?.parts ?? []" :key="part.id" :value="part.id">
            {{ part.name }}
          </option>
        </select>
      </label>

      <div class="step-row" role="group" aria-label="Step melody notes">
        <button
          type="button"
          class="btn sm"
          :title="tipByShortcutId('harm-prev')"
          @click="step(-1)"
        >
          ← Prev
        </button>
        <span class="step-meta">
          <template v-if="melodyNote">
            {{ melodyIndex + 1 }}/{{ melodyNotesSorted.length }} ·
            {{ midiToNote(melodyNote.midi) }}
          </template>
          <template v-else>No {{ melodyPart?.name ?? 'melody' }} notes</template>
        </span>
        <button
          type="button"
          class="btn sm"
          :title="tipByShortcutId('harm-next')"
          @click="step(1)"
        >
          Next →
        </button>
      </div>

      <p v-if="!melodyNote" class="warn">
        Add a {{ melodyPart?.name ?? 'melody' }} note or move the playhead onto one.
      </p>
      <template v-else>
        <p class="meta">
          {{ melodyPart?.name ?? 'Melody' }} {{ midiToNote(melodyNote.midi) }} · root
          {{ pcName(rootPc, preferFlats) }}
        </p>

        <section class="block" aria-label="Root">
          <h3 class="sec">Root</h3>
          <div class="grid">
            <button
              v-for="r in ROOT_OFFSETS"
              :key="`${r.offset}-${r.name}`"
              type="button"
              class="cell"
              :class="{ on: rootOffset === r.offset }"
              :title="
                tagRollTip(
                  `Root ${r.name || pcName((project!.tonality + r.offset + 12) % 12, preferFlats)}`,
                )
              "
              @click="selectRoot(r.offset)"
            >
              {{ r.name || pcName((project!.tonality + r.offset + 12) % 12, preferFlats) }}
            </button>
          </div>
        </section>

        <section class="block" aria-label="Chord">
          <h3 class="sec">Chord</h3>
          <div class="grid">
            <button
              v-for="c in availableChords"
              :key="c.id"
              type="button"
              class="cell"
              :class="{ on: chordId === c.id }"
              :title="tagRollTip(c.name)"
              @click="selectChord(c.id)"
            >
              {{ c.notation || 'maj' }}
            </button>
          </div>
          <p v-if="!availableChords.length" class="empty">No chords contain this melody tone.</p>
        </section>

        <section class="block" aria-label="Voicing">
          <h3 class="sec">Voicing</h3>
          <div class="spread-row">
            <button
              type="button"
              class="btn sm"
              :class="{ on: !spread }"
              :title="tagRollTip('Closed voicing')"
              @click="setSpread(false)"
            >
              Closed
            </button>
            <button
              type="button"
              class="btn sm"
              :class="{ on: spread }"
              :title="tagRollTip('Spread voicing')"
              @click="setSpread(true)"
            >
              Spread
            </button>
          </div>
          <div class="grid">
            <button
              v-for="v in availableVoicings"
              :key="v"
              type="button"
              class="cell mono"
              :class="{ on: voicing === v }"
              :title="tagRollTip(`Voicing ${v}`)"
              @click="selectVoicing(v)"
            >
              {{ v }}
            </button>
          </div>
          <p v-if="chordId && !availableVoicings.length" class="empty">No voicings for this melody role.</p>
        </section>

        <div class="actions">
          <button
            type="button"
            class="btn"
            :disabled="appliedCount <= 0"
            :title="tipByShortcutId('harm-cancel')"
            @click="onCancel"
          >
            Cancel
          </button>
        </div>
      </template>

      <p class="credit">
        Chord / voicing tables inspired by the MuseScore Barbershop Harmonizer plugin (znarf94) —
        reimplemented for Tag Studio. Selecting a chord applies it immediately.
      </p>
    </div>
  </Teleport>
</template>

<style scoped>
.tr-hz {
  position: fixed;
  z-index: 220;
  display: grid;
  gap: 0.55rem;
  width: min(21.5rem, calc(100vw - 1.5rem));
  max-height: min(72vh, calc(100dvh - 1.5rem));
  overflow: auto;
  padding: 0.65rem 0.75rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  box-shadow:
    0 12px 40px color-mix(in srgb, #000 18%, transparent),
    0 0 0 1px color-mix(in srgb, var(--border) 80%, transparent);
  /* Panel only — no backdrop; roll stays interactive underneath. */
  pointer-events: auto;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  cursor: grab;
  user-select: none;
  touch-action: none;
  margin: -0.15rem -0.15rem 0;
  padding: 0.15rem;
  border-radius: 8px;
}
.head:active {
  cursor: grabbing;
}
.title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  pointer-events: none;
}
.field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
.lbl {
  font-size: 0.72rem;
  font-weight: 650;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.sel {
  min-height: 34px;
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 0.9rem;
}
.step-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.step-meta {
  flex: 1;
  font-size: 0.85rem;
  font-weight: 600;
  text-align: center;
}
.meta,
.warn,
.empty,
.credit {
  margin: 0;
  font-size: 0.82rem;
  color: var(--muted);
}
.warn {
  color: var(--danger, #b42318);
}
.block {
  display: grid;
  gap: 0.35rem;
}
.sec {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 650;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.cell {
  min-height: 34px;
  min-width: 2.4rem;
  padding: 0.2rem 0.45rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.cell.mono {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}
.cell.on,
.btn.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  color: var(--accent);
}
.spread-row {
  display: flex;
  gap: 0.3rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.btn {
  min-height: 36px;
  padding: 0.25rem 0.7rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 650;
  font-size: 0.9rem;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn.sm {
  min-height: 32px;
  padding: 0.15rem 0.55rem;
  font-size: 0.85rem;
}
.btn.ghost {
  border-color: transparent;
  background: transparent;
  color: var(--muted);
}
.credit {
  font-size: 0.72rem;
  line-height: 1.35;
}
</style>
