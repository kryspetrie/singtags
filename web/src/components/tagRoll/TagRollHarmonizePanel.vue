<script setup lang="ts">
/**
 * Lead-anchored barbershop chord entry.
 * UX/algorithm inspired by znarf94/MuseScore_Barbershop_Harmonizer (reimplemented; not QML).
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { midiToNote } from '../../audio/pianoSamples'
import { createPitchTonePlayer, type PitchTonePlayer } from '../../audio/pitchTone'
import {
  BARBERSHOP_CHORDS,
  chordContainsLead,
  leadRoleInChord,
  placeVoicing,
  pcName,
  ROOT_OFFSETS,
  VOICINGS_BY_CHORD,
  voicingFitsLead,
  type BarbershopChordNature,
  type VoicingPitches,
} from '../../lib/tagRoll/harmonizer/chords'
import { notesAtTick } from '../../lib/tagRoll/notesAtTick'
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
}>()

const store = useTagRollStore()
const rootOffset = ref(0)
const chordId = ref<string | null>(null)
const voicing = ref<string | null>(null)
const spread = ref(false)

let player: PitchTonePlayer | null = null
let stabTimer: ReturnType<typeof setTimeout> | null = null

const project = computed(() => store.current)

const leadPart = computed(() => project.value?.parts.find((p) => p.name === 'Lead') ?? null)

const leadNote = computed((): TagRollNote | null => {
  const p = project.value
  const lead = leadPart.value
  if (!p || !lead) return null
  const sel = store.selectedNote
  if (sel && sel.partId === lead.id) return sel
  const at = notesAtTick(p.notes, p.view.playheadTick).filter((n) => n.partId === lead.id)
  if (!at.length) return null
  return at.slice().sort((a, b) => a.midi - b.midi)[0] ?? null
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
  const lead = leadNote.value
  if (!lead) return []
  return BARBERSHOP_CHORDS.filter((c) => chordContainsLead(c, rootPc.value, lead.midi))
})

const leadRole = computed(() => {
  const chord = selectedChord.value
  const lead = leadNote.value
  if (!chord || !lead) return null
  return leadRoleInChord(chord, rootPc.value, lead.midi)
})

const availableVoicings = computed(() => {
  const chord = selectedChord.value
  const role = leadRole.value
  if (!chord || role == null) return []
  const list = VOICINGS_BY_CHORD[chord.id] ?? []
  return list.filter((v) => voicingFitsLead(v, role))
})

const placed = computed((): VoicingPitches | null => {
  const chord = selectedChord.value
  const lead = leadNote.value
  const v = voicing.value
  if (!chord || !lead || !v) return null
  return placeVoicing({
    chord,
    rootPc: rootPc.value,
    leadMidi: lead.midi,
    voicing: v,
    spread: spread.value,
  })
})

function ghostsFromPlaced(pitches: VoicingPitches, lead: TagRollNote): TagRollGhostNote[] {
  const parts = project.value?.parts ?? []
  const colorFor = (name: string, fallback: string) =>
    parts.find((p) => p.name === name)?.color ?? fallback
  return [
    {
      role: 'tenor',
      midi: pitches.tenor,
      startTick: lead.startTick,
      durationTicks: lead.durationTicks,
      color: colorFor('Tenor', '#c45c26'),
    },
    {
      role: 'bari',
      midi: pitches.bari,
      startTick: lead.startTick,
      durationTicks: lead.durationTicks,
      color: colorFor('Bari', '#2f7d4a'),
    },
    {
      role: 'bass',
      midi: pitches.bass,
      startTick: lead.startTick,
      durationTicks: lead.durationTicks,
      color: colorFor('Bass', '#5b3d8f'),
    },
  ]
}

function pushPreview(): void {
  const lead = leadNote.value
  const pitches = placed.value
  if (!lead || !pitches) {
    emit('clearGhost')
    return
  }
  emit('previewGhost', ghostsFromPlaced(pitches, lead))
}

watch(
  [placed, () => props.open],
  () => {
    if (!props.open) return
    pushPreview()
  },
  { immediate: true },
)

watch(
  () => props.open,
  (on) => {
    if (!on) {
      emit('clearGhost')
      stopStab()
    } else {
      // Reset invalid selections when opening
      if (chordId.value && !availableChords.value.some((c) => c.id === chordId.value)) {
        chordId.value = null
        voicing.value = null
      }
    }
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

watch(rootOffset, () => {
  chordId.value = null
  voicing.value = null
})

function ensurePlayer(): PitchTonePlayer {
  if (!player) {
    const engine = project.value?.soundEngine ?? 'synth'
    player = createPitchTonePlayer(engine, { polyphony: true })
  }
  return player
}

function stopStab(): void {
  if (stabTimer) {
    clearTimeout(stabTimer)
    stabTimer = null
  }
  player?.allNotesOff(true)
}

async function onHear(): Promise<void> {
  const pitches = placed.value
  if (!pitches) return
  stopStab()
  const p = ensurePlayer()
  const notes = [pitches.bass, pitches.bari, pitches.lead, pitches.tenor].map((m) =>
    midiToNote(m),
  )
  await Promise.all(notes.map((n) => p.noteOn(n)))
  stabTimer = setTimeout(() => {
    stabTimer = null
    p.allNotesOff(true)
  }, 700)
}

function onApply(): void {
  const lead = leadNote.value
  const pitches = placed.value
  if (!lead || !pitches) return
  store.upsertHarmonyNotes({
    leadNoteId: lead.id,
    tenorMidi: pitches.tenor,
    bariMidi: pitches.bari,
    bassMidi: pitches.bass,
  })
  emit('clearGhost')
}

function onClose(): void {
  stopStab()
  emit('clearGhost')
  emit('close')
}

function selectRoot(offset: number): void {
  rootOffset.value = offset
}

function selectChord(id: string): void {
  chordId.value = id
  voicing.value = null
}

function selectVoicing(v: string): void {
  voicing.value = v
}

onUnmounted(() => {
  stopStab()
  player?.dispose()
  player = null
})
</script>

<template>
  <div v-if="open" class="tr-hz" role="dialog" aria-label="Harmonize">
    <header class="head">
      <h2 class="title">Harmonize</h2>
      <button type="button" class="btn ghost" aria-label="Close" @click="onClose">✕</button>
    </header>

    <p v-if="!leadNote" class="warn">
      Select a Lead note or place the playhead on one.
    </p>
    <template v-else>
      <p class="meta">
        Lead {{ midiToNote(leadNote.midi) }} · root
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
            :title="c.name"
            @click="selectChord(c.id)"
          >
            {{ c.notation || 'maj' }}
          </button>
        </div>
        <p v-if="!availableChords.length" class="empty">No chords contain this lead tone.</p>
      </section>

      <section class="block" aria-label="Voicing">
        <h3 class="sec">Voicing</h3>
        <div class="spread-row">
          <button
            type="button"
            class="btn sm"
            :class="{ on: !spread }"
            @click="spread = false"
          >
            Closed
          </button>
          <button
            type="button"
            class="btn sm"
            :class="{ on: spread }"
            @click="spread = true"
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
            @click="selectVoicing(v)"
          >
            {{ v }}
          </button>
        </div>
        <p v-if="chordId && !availableVoicings.length" class="empty">No voicings for this lead role.</p>
      </section>

      <div class="actions">
        <button type="button" class="btn" :disabled="!placed" @click="onHear">Hear</button>
        <button type="button" class="btn primary" :disabled="!placed" @click="onApply">
          Apply
        </button>
      </div>
    </template>

    <p class="credit">
      Chord / voicing tables inspired by the MuseScore Barbershop Harmonizer plugin (znarf94) —
      reimplemented for Tag Roll.
    </p>
  </div>
</template>

<style scoped>
.tr-hz {
  display: grid;
  gap: 0.55rem;
  padding: 0.65rem 0.75rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  max-width: 28rem;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
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
.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent, #fff);
}
.credit {
  font-size: 0.72rem;
  line-height: 1.35;
}
</style>
