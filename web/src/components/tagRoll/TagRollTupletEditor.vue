<script setup lang="ts">
/**
 * Modal editor for a piano-roll tuplet container (irregular local slots).
 * Look-and-feel matches ConfirmDialog / SeedLibrary (Teleport, backdrop, display title).
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { pcName } from '../../lib/tagRoll/harmonizer/chords'
import { TUPLET_PRESETS } from '../../lib/tagRoll/tupletContainers'
import {
  draftFromTuplet,
  resliceDraftSlots,
  type TupletEditorDraft,
  type TupletEditorSlot,
} from '../../lib/tagRoll/tupletEditor'
import type { TagRollProject, TagRollTuplet } from '../../lib/tagRoll/types'
import { tagRollTip } from '../../lib/tagRoll/shortcuts'

const props = defineProps<{
  open: boolean
  project: TagRollProject
  tupletId: string | null
}>()

const emit = defineEmits<{
  close: []
  apply: [draft: TupletEditorDraft]
  hear: [notes: { midi: number; durationTicks: number }[]]
}>()

const draft = ref<TupletEditorDraft | null>(null)
const firstField = ref<HTMLInputElement | null>(null)
const pendingPreset = ref<keyof typeof TUPLET_PRESETS | null>(null)

function setFirstField(el: unknown): void {
  firstField.value = (el as HTMLInputElement | null) ?? null
}

const tuplet = computed((): TagRollTuplet | null => {
  if (!props.tupletId) return null
  return (props.project.tuplets ?? []).find((t) => t.id === props.tupletId) ?? null
})

function loadDraft(): void {
  const t = tuplet.value
  if (!t) {
    draft.value = null
    return
  }
  draft.value = draftFromTuplet(t, props.project.notes)
  pendingPreset.value = null
}

watch(
  () => [props.open, props.tupletId] as const,
  ([open]) => {
    if (open) {
      loadDraft()
      requestAnimationFrame(() => firstField.value?.focus())
    } else {
      draft.value = null
      pendingPreset.value = null
    }
  },
)

const title = computed(() => {
  const d = draft.value
  if (!d) return 'Tuplet'
  if (d.actualNotes === 3 && d.normalNotes === 2) return 'Triplet'
  if (d.actualNotes === 6 && d.normalNotes === 4) return 'Sextuplet'
  return `Tuplet ${d.actualNotes}:${d.normalNotes}`
})

const activePreset = computed((): keyof typeof TUPLET_PRESETS | null => {
  const d = draft.value
  if (!d) return null
  for (const key of Object.keys(TUPLET_PRESETS) as (keyof typeof TUPLET_PRESETS)[]) {
    const r = TUPLET_PRESETS[key]
    if (r.actualNotes === d.actualNotes && r.normalNotes === d.normalNotes) return key
  }
  return null
})

function applyPreset(kind: keyof typeof TUPLET_PRESETS): void {
  const d = draft.value
  if (!d) return
  const ratio = TUPLET_PRESETS[kind]
  draft.value = resliceDraftSlots(d, {
    actualNotes: ratio.actualNotes,
    normalNotes: ratio.normalNotes,
    spanTicks: d.spanTicks,
  })
  pendingPreset.value = null
}

function requestPreset(kind: keyof typeof TUPLET_PRESETS): void {
  const d = draft.value
  if (!d) return
  const ratio = TUPLET_PRESETS[kind]
  if (ratio.actualNotes === d.actualNotes && ratio.normalNotes === d.normalNotes) return
  const hasPitches = d.slots.some((s) => s.midi != null)
  if (hasPitches) {
    pendingPreset.value = kind
    return
  }
  applyPreset(kind)
}

function setSlotMidi(i: number, raw: string): void {
  const d = draft.value
  if (!d) return
  const slots = d.slots.map((s, idx) => {
    if (idx !== i) return s
    const trimmed = raw.trim()
    if (!trimmed) return { ...s, midi: null }
    const n = Number(trimmed)
    if (!Number.isFinite(n)) return s
    return { ...s, midi: Math.max(0, Math.min(127, Math.round(n))) }
  })
  draft.value = { ...d, slots }
}

function setSlotLyric(i: number, lyric: string): void {
  const d = draft.value
  if (!d) return
  const slots = d.slots.map((s, idx) =>
    idx === i ? ({ ...s, lyric } satisfies TupletEditorSlot) : s,
  )
  draft.value = { ...d, slots }
}

function pitchLabel(midi: number | null): string {
  if (midi == null) return '—'
  const pc = ((midi % 12) + 12) % 12
  const oct = Math.floor(midi / 12) - 1
  return `${pcName(pc, props.project.preferFlats)}${oct}`
}

function onApply(): void {
  if (!draft.value) return
  emit('apply', draft.value)
  emit('close')
}

function onCancel(): void {
  pendingPreset.value = null
  emit('close')
}

function onHear(): void {
  const d = draft.value
  if (!d) return
  const sounding = d.slots
    .map((s) => {
      if (s.midi == null) return null
      const sliceDur = Math.max(1, Math.floor(d.spanTicks / d.actualNotes))
      return { midi: s.midi, durationTicks: sliceDur }
    })
    .filter((x): x is { midi: number; durationTicks: number } => !!x)
  emit('hear', sounding)
}

function onKey(e: KeyboardEvent): void {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    if (pendingPreset.value) {
      pendingPreset.value = null
      return
    }
    onCancel()
    return
  }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !pendingPreset.value) {
    e.preventDefault()
    onApply()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey, true)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey, true)
})

defineExpose({ draft, loadDraft })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && draft"
      class="tuplet-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tuplet-editor-title"
      @keydown.escape.prevent="onCancel"
    >
      <button type="button" class="backdrop" aria-label="Cancel" @click="onCancel" />
      <div class="panel" @click.stop>
        <header class="head">
          <div class="intro">
            <h2 id="tuplet-editor-title" class="title">{{ title }}</h2>
            <p class="lead">
              Edit pitches in equal slots across this span. The piano-roll grid stays binary —
              empty slots leave rests.
            </p>
          </div>
          <button
            type="button"
            class="close"
            :aria-label="tagRollTip('Close', 'Esc')"
            :title="tagRollTip('Close', 'Esc')"
            @click="onCancel"
          >
            ✕
          </button>
        </header>

        <div class="presets segment" role="group" aria-label="Tuplet ratio">
          <button
            type="button"
            class="seg-btn"
            :class="{ on: activePreset === 'triplet' }"
            :aria-pressed="activePreset === 'triplet'"
            @click="requestPreset('triplet')"
          >
            Triplet 3:2
          </button>
          <button
            type="button"
            class="seg-btn"
            :class="{ on: activePreset === 'sextuplet' }"
            :aria-pressed="activePreset === 'sextuplet'"
            @click="requestPreset('sextuplet')"
          >
            Sextuplet 6:4
          </button>
          <button
            type="button"
            class="seg-btn"
            :class="{ on: activePreset === 'quintuplet' }"
            :aria-pressed="activePreset === 'quintuplet'"
            @click="requestPreset('quintuplet')"
          >
            Quintuplet 5:4
          </button>
        </div>

        <div v-if="pendingPreset" class="preset-warn" role="status">
          <p>
            Change to
            {{
              pendingPreset === 'triplet'
                ? 'triplet'
                : pendingPreset === 'sextuplet'
                  ? 'sextuplet'
                  : 'quintuplet'
            }}?
            Existing pitches keep their order; extra slots clear.
          </p>
          <div class="preset-warn-actions">
            <button type="button" class="btn" @click="pendingPreset = null">Keep</button>
            <button
              type="button"
              class="btn btn-primary"
              @click="pendingPreset && applyPreset(pendingPreset)"
            >
              Change
            </button>
          </div>
        </div>

        <div class="slots" role="list">
          <div
            v-for="(slot, i) in draft.slots"
            :key="i"
            class="slot"
            role="listitem"
          >
            <label class="slot-lab" :for="`tup-midi-${i}`">{{ i + 1 }}</label>
            <input
              :id="`tup-midi-${i}`"
              :ref="i === 0 ? setFirstField : undefined"
              class="slot-midi"
              type="number"
              min="0"
              max="127"
              :value="slot.midi ?? ''"
              placeholder="MIDI"
              :aria-label="`Slot ${i + 1} MIDI`"
              @input="setSlotMidi(i, ($event.target as HTMLInputElement).value)"
            />
            <span class="slot-name" aria-hidden="true">{{ pitchLabel(slot.midi) }}</span>
            <input
              class="slot-lyric"
              type="text"
              maxlength="24"
              :value="slot.lyric ?? ''"
              :aria-label="`Slot ${i + 1} lyric`"
              placeholder="Lyric"
              @input="setSlotLyric(i, ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>

        <footer class="actions">
          <button type="button" class="btn" @click="onHear">Hear</button>
          <div class="spacer" />
          <button type="button" class="btn" @click="onCancel">Cancel</button>
          <button type="button" class="btn btn-primary" @click="onApply">Apply</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tuplet-root {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  padding-bottom: calc(1rem + var(--bottom-nav-h, 3.75rem) + env(safe-area-inset-bottom));
}
.backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(0, 0, 0, 0.45);
  cursor: pointer;
}
.panel {
  position: relative;
  z-index: 1;
  width: min(28rem, 100%);
  max-height: min(
    36rem,
    calc(100dvh - 2rem - var(--bottom-nav-h, 3.75rem) - env(safe-area-inset-bottom))
  );
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1.1rem 1.15rem 1.15rem;
  border-radius: var(--radius, 12px);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}
.intro {
  min-width: 0;
}
.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  line-height: 1.25;
}
.lead {
  margin: 0.35rem 0 0;
  color: var(--muted);
  font-size: 0.95rem;
  line-height: 1.45;
}
.close {
  flex: 0 0 auto;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 1.15rem;
  cursor: pointer;
}
.close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.presets.segment {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
  padding: 0.15rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg, var(--surface)) 65%, var(--surface));
}
.seg-btn {
  flex: 1 1 auto;
  min-height: 34px;
  padding: 0.28rem 0.55rem;
  border: 0;
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
.preset-warn {
  display: grid;
  gap: 0.55rem;
  padding: 0.7rem 0.8rem;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.preset-warn p {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.4;
  color: var(--text);
}
.preset-warn-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.45rem;
}
.slots {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.slot {
  display: grid;
  grid-template-columns: 1.4rem 4.4rem 2.8rem 1fr;
  gap: 0.4rem;
  align-items: center;
}
.slot-lab {
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}
.slot-midi,
.slot-lyric {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.35rem 0.45rem;
  min-height: 2.2rem;
  background: var(--bg, var(--surface));
  color: inherit;
  font: inherit;
}
.slot-midi:focus-visible,
.slot-lyric:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.slot-name {
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.15rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}
.spacer {
  flex: 1 1 auto;
  min-width: 0.5rem;
}
/* Button look comes from utilities.css (.btn / .btn-primary). */
</style>
