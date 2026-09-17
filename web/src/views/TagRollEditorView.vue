<script setup lang="ts">
/**
 * Tag Roll editor — phases 2–7 wired: notes, transport, lyrics, export, harmonize.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { createPitchTonePlayer, type PitchTonePlayer } from '../audio/pitchTone'
import { midiToNote } from '../audio/pianoSamples'
import TagRollHarmonizePanel from '../components/tagRoll/TagRollHarmonizePanel.vue'
import TagRollLyricsInput from '../components/tagRoll/TagRollLyricsInput.vue'
import TagRollPartsPanel from '../components/tagRoll/TagRollPartsPanel.vue'
import TagRollTote from '../components/tagRoll/TagRollTote.vue'
import TagRollToolbar from '../components/tagRoll/TagRollToolbar.vue'
import TagRollViewport from '../components/tagRoll/TagRollViewport.vue'
import { notesAtTick } from '../lib/tagRoll/notesAtTick'
import { createTagRollScheduler, type TagRollScheduler } from '../lib/tagRoll/scheduler'
import { downloadTagRollMidi, type MidiExportMode } from '../lib/tagRoll/midiExport'
import { saveTagRollToLibrary } from '../lib/tagRoll/saveToLibrary'
import { useSnackbarStore } from '../stores/snackbar'
import { useTagRollStore } from '../stores/tagRoll'
import { snapTick } from '../lib/tagRoll/snap'

const props = defineProps<{ id: string }>()

const store = useTagRollStore()
const snackbar = useSnackbarStore()
const router = useRouter()

const viewportRef = ref<InstanceType<typeof TagRollViewport> | null>(null)
const stageH = ref(480)
const titleDraft = ref('')
const partsOpen = ref(false)
const harmonizeOpen = ref(false)
const ghostNotes = ref<
  { midi: number; startTick: number; durationTicks: number; color: string }[]
>([])
const saveBusy = ref(false)

const project = computed(() => store.current)

let player: PitchTonePlayer | null = null
let scheduler: TagRollScheduler | null = null

function ensurePlayer(): PitchTonePlayer {
  const eng = project.value?.soundEngine ?? 'synth'
  if (!player) {
    player = createPitchTonePlayer(eng, { polyphony: true })
  }
  return player
}

function rebuildScheduler(): void {
  scheduler?.dispose()
  scheduler = null
  if (!project.value) return
  const p = ensurePlayer()
  scheduler = createTagRollScheduler({
    getNotes: () => store.current?.notes ?? [],
    getBpm: () => store.current?.bpm ?? 120,
    getLengthTicks: () => store.current?.lengthTicks ?? 0,
    player: p,
    onPlayhead: (tick) => {
      if (store.current) store.setPlayheadTick(tick)
    },
    onEnded: () => {
      store.transportPlaying = false
    },
  })
}

onMounted(async () => {
  const p = await store.openProject(props.id)
  if (!p) {
    await router.replace({ name: 'tag-roll' })
    return
  }
  titleDraft.value = p.title
  rebuildScheduler()
})

onUnmounted(() => {
  scheduler?.dispose()
  player?.dispose()
  scheduler = null
  player = null
  void store.persistNow()
  store.clearCurrent()
})

watch(
  () => props.id,
  async (id) => {
    scheduler?.stop({ resetPlayhead: false })
    store.transportPlaying = false
    const p = await store.openProject(id)
    if (!p) await router.replace({ name: 'tag-roll' })
    else {
      titleDraft.value = p.title
      rebuildScheduler()
    }
  },
)

watch(
  () => project.value?.soundEngine,
  () => {
    player?.dispose()
    player = null
    rebuildScheduler()
  },
)

function onTitleBlur(): void {
  const t = titleDraft.value.trim() || 'Untitled tag'
  titleDraft.value = t
  if (project.value && t !== project.value.title) {
    store.patchProject({ title: t })
  }
}

function onPlay(): void {
  store.setMode('view')
  rebuildScheduler()
  scheduler?.play(store.current?.view.playheadTick ?? 0)
  store.transportPlaying = true
}

function onPause(): void {
  scheduler?.pause()
  store.transportPlaying = false
}

function onStop(): void {
  scheduler?.stop({ resetPlayhead: false })
  store.transportPlaying = false
}

async function auditionTick(tick: number): Promise<void> {
  const p = project.value
  if (!p) return
  const notes = notesAtTick(p.notes, tick)
  if (ghostNotes.value.length) {
    // include ghosts when harmonizing
    for (const g of ghostNotes.value) {
      notes.push({
        id: `ghost-${g.midi}`,
        partId: '',
        midi: g.midi,
        startTick: g.startTick,
        durationTicks: g.durationTicks,
      })
    }
  }
  const tone = ensurePlayer()
  tone.allNotesOff(false)
  const names = [...new Set(notes.map((n) => midiToNote(n.midi)))]
  await Promise.all(names.map((n) => tone.noteOn(n)))
  window.setTimeout(() => {
    for (const n of names) tone.noteOff(n, true)
  }, 650)
}

function onHearStack(): void {
  void auditionTick(project.value?.view.playheadTick ?? 0)
}

function onAuditionColumn(payload: { tick: number; movePlayhead: boolean }): void {
  if (payload.movePlayhead) store.setPlayheadTick(payload.tick)
  void auditionTick(payload.tick)
}

function onExportMidi(mode: MidiExportMode): void {
  if (!project.value) return
  downloadTagRollMidi(project.value, mode)
}

async function onSaveLibrary(): void {
  if (!project.value || saveBusy.value) return
  saveBusy.value = true
  try {
    const { entryId } = await saveTagRollToLibrary(project.value, {
      mix: true,
      perPart: true,
      updateLinked: true,
    })
    store.setLocalEntryId(entryId)
    snackbar.show('Saved to My Library', {
      action: {
        label: 'Open',
        onClick: () => {
          void router.push({ name: 'library-doc', params: { id: entryId } })
        },
      },
    })
  } catch (e) {
    snackbar.show(e instanceof Error ? e.message : 'Save to My Library failed', {
      tone: 'error',
    })
  } finally {
    saveBusy.value = false
  }
}

function onAdd(payload: { midi: number; startTick: number }): void {
  store.addNote({
    midi: payload.midi,
    startTick: snapTick(payload.startTick, project.value?.snapTicks ?? 120),
  })
  store.setMode('edit')
}

function onGhost(
  ghosts: {
    role?: string
    midi: number
    startTick: number
    durationTicks: number
    color: string
  }[],
): void {
  ghostNotes.value = ghosts.map((g) => ({
    midi: g.midi,
    startTick: g.startTick,
    durationTicks: g.durationTicks,
    color: g.color,
  }))
}
</script>

<template>
  <section v-if="project" class="tr-ed" aria-label="Tag Roll editor">
    <header class="top">
      <RouterLink class="back" to="/labs/tag-roll">← Projects</RouterLink>
      <input
        v-model="titleDraft"
        class="title-input"
        aria-label="Project title"
        @blur="onTitleBlur"
        @keydown.enter="($event.target as HTMLInputElement).blur()"
      />
    </header>

    <TagRollToolbar
      @play="onPlay"
      @pause="onPause"
      @stop="onStop"
      @hear-stack="onHearStack"
      @export-midi="onExportMidi"
      @save-library="onSaveLibrary"
      @open-harmonize="harmonizeOpen = true"
      @parts="partsOpen = true"
    />

    <TagRollLyricsInput />

    <p v-if="store.error" class="err" role="alert">{{ store.error }}</p>
    <p v-if="saveBusy" class="hint">Saving to My Library…</p>

    <div class="stage" :style="{ height: `${stageH}px` }">
      <TagRollTote
        :project="project"
        :viewport-height="viewportRef?.cssH ?? stageH"
        @scroll-y="(y) => store.setScroll(project.view.scrollX, y)"
      />
      <TagRollViewport
        ref="viewportRef"
        :project="project"
        :selected-note-id="store.selectedNoteId"
        :ghost-notes="ghostNotes"
        @scroll="(x, y) => store.setScroll(x, y)"
        @playhead="(t) => store.setPlayheadTick(t)"
        @select="(id) => store.selectNote(id)"
        @add="onAdd"
        @move="(p) => store.updateNote(p.id, { midi: p.midi, startTick: p.startTick })"
        @resize="(p) => store.updateNote(p.id, { durationTicks: p.durationTicks })"
        @cell-size="(p) => store.setCellSize(p.cellW, p.cellH)"
        @audition-column="onAuditionColumn"
      />
    </div>

    <TagRollPartsPanel :open="partsOpen" @close="partsOpen = false" />
    <TagRollHarmonizePanel
      :open="harmonizeOpen"
      @close="
        harmonizeOpen = false
        ghostNotes = []
      "
      @preview-ghost="onGhost"
      @clear-ghost="ghostNotes = []"
    />
  </section>
  <p v-else class="loading">Loading…</p>
</template>

<style scoped>
.tr-ed {
  display: grid;
  gap: 0.55rem;
  min-height: 0;
  padding-bottom: 1.5rem;
}
.top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
}
.back {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.9rem;
}
.title-input {
  min-width: 10rem;
  max-width: min(22rem, 70vw);
  min-height: 40px;
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 650;
  font-size: 1.05rem;
}
.stage {
  display: flex;
  min-height: 280px;
  max-height: min(70vh, 640px);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--surface);
}
.err {
  margin: 0;
  color: var(--danger, #b42318);
}
.hint,
.loading {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}
</style>
