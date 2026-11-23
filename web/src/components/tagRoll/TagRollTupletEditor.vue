<script setup lang="ts">
/**
 * Modal editor for a piano-roll tuplet container.
 * Canvas mini-roll matches main TagRoll place/drag/audition feel within slot constraints.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { TUPLET_PRESETS } from '../../lib/tagRoll/tupletContainers'
import {
  draftFromTuplet,
  resliceDraftSlots,
  type TupletEditorDraft,
  type TupletEditorSlot,
} from '../../lib/tagRoll/tupletEditor'
import type { TagRollProject, TagRollTuplet } from '../../lib/tagRoll/types'
import { tagRollTip } from '../../lib/tagRoll/shortcuts'
import TagRollTupletMiniRoll from './TagRollTupletMiniRoll.vue'

const props = defineProps<{
  open: boolean
  project: TagRollProject
  tupletId: string | null
}>()

const emit = defineEmits<{
  close: []
  apply: [draft: TupletEditorDraft]
  hear: [notes: { midi: number; durationTicks: number }[]]
  auditionNote: [midi: number]
  previewPitch: [midi: number | null]
}>()

const MAX_ACTUAL = 16
const MAX_NORMAL = 16

const draft = ref<TupletEditorDraft | null>(null)
const pendingRatio = ref<{ actualNotes: number; normalNotes: number } | null>(null)
const selectedSlot = ref(0)

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
  pendingRatio.value = null
  selectedSlot.value = 0
}

watch(
  () => [props.open, props.tupletId] as const,
  ([open]) => {
    if (open) {
      loadDraft()
    } else {
      draft.value = null
      pendingRatio.value = null
      emit('previewPitch', null)
    }
  },
)

const title = computed(() => {
  const d = draft.value
  if (!d) return 'Tuplets'
  if (d.actualNotes === 3 && d.normalNotes === 2) return 'Triplet'
  if (d.actualNotes === 6 && d.normalNotes === 4) return 'Sextuplet'
  if (d.actualNotes === 5 && d.normalNotes === 4) return 'Quintuplet'
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

function applyRatio(actualNotes: number, normalNotes: number): void {
  const d = draft.value
  if (!d) return
  const nextActual = Math.max(2, Math.min(MAX_ACTUAL, Math.round(actualNotes)))
  const nextNormal = Math.max(1, Math.min(MAX_NORMAL, Math.round(normalNotes)))
  draft.value = resliceDraftSlots(d, {
    actualNotes: nextActual,
    normalNotes: nextNormal,
    spanTicks: d.spanTicks,
  })
  pendingRatio.value = null
  if (selectedSlot.value >= nextActual) selectedSlot.value = nextActual - 1
}

function requestRatio(actualNotes: number, normalNotes: number): void {
  const d = draft.value
  if (!d) return
  if (actualNotes === d.actualNotes && normalNotes === d.normalNotes) return
  const hasPitches = d.slots.some((s) => s.midi != null)
  if (hasPitches && actualNotes < d.actualNotes) {
    pendingRatio.value = { actualNotes, normalNotes }
    return
  }
  applyRatio(actualNotes, normalNotes)
}

function requestPreset(kind: keyof typeof TUPLET_PRESETS): void {
  const ratio = TUPLET_PRESETS[kind]
  requestRatio(ratio.actualNotes, ratio.normalNotes)
}

function onActualInput(raw: string): void {
  const d = draft.value
  if (!d) return
  const n = Number(raw)
  if (!Number.isFinite(n)) return
  requestRatio(n, d.normalNotes)
}

function onNormalInput(raw: string): void {
  const d = draft.value
  if (!d) return
  const n = Number(raw)
  if (!Number.isFinite(n)) return
  requestRatio(d.actualNotes, n)
}

function onSlotsUpdate(slots: TupletEditorSlot[]): void {
  const d = draft.value
  if (!d) return
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

function onApply(): void {
  if (!draft.value) return
  emit('previewPitch', null)
  emit('apply', draft.value)
  emit('close')
}

function onCancel(): void {
  pendingRatio.value = null
  emit('previewPitch', null)
  emit('close')
}

function onHear(): void {
  const d = draft.value
  if (!d) return
  emit('previewPitch', null)
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
    if (pendingRatio.value) {
      pendingRatio.value = null
      return
    }
    onCancel()
    return
  }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !pendingRatio.value) {
    e.preventDefault()
    onApply()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey, true)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey, true)
  emit('previewPitch', null)
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
              Columns = equal slots of this span. Place/drag/Delete like the main roll; empty =
              rest. Hear plays in tempo.
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

        <div class="ratio-row">
          <div class="presets segment" role="group" aria-label="Common ratios">
            <button
              type="button"
              class="seg-btn"
              :class="{ on: activePreset === 'triplet' }"
              :aria-pressed="activePreset === 'triplet'"
              @click="requestPreset('triplet')"
            >
              3:2
            </button>
            <button
              type="button"
              class="seg-btn"
              :class="{ on: activePreset === 'sextuplet' }"
              :aria-pressed="activePreset === 'sextuplet'"
              @click="requestPreset('sextuplet')"
            >
              6:4
            </button>
            <button
              type="button"
              class="seg-btn"
              :class="{ on: activePreset === 'quintuplet' }"
              :aria-pressed="activePreset === 'quintuplet'"
              @click="requestPreset('quintuplet')"
            >
              5:4
            </button>
          </div>
          <label class="ratio-field">
            <span class="ratio-lab">Actual</span>
            <input
              class="ratio-input"
              type="number"
              min="2"
              :max="MAX_ACTUAL"
              step="1"
              :value="draft.actualNotes"
              aria-label="Actual notes in tuplet"
              @change="onActualInput(($event.target as HTMLInputElement).value)"
            />
          </label>
          <span class="ratio-colon" aria-hidden="true">:</span>
          <label class="ratio-field">
            <span class="ratio-lab">Normal</span>
            <input
              class="ratio-input"
              type="number"
              min="1"
              :max="MAX_NORMAL"
              step="1"
              :value="draft.normalNotes"
              aria-label="Normal notes replaced by tuplet"
              @change="onNormalInput(($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>

        <div v-if="pendingRatio" class="preset-warn" role="status">
          <p>
            Change to {{ pendingRatio.actualNotes }}:{{ pendingRatio.normalNotes }}? Extra slots
            beyond the new count will be dropped.
          </p>
          <div class="preset-warn-actions">
            <button type="button" class="btn" @click="pendingRatio = null">Keep</button>
            <button
              type="button"
              class="btn btn-primary"
              @click="pendingRatio && applyRatio(pendingRatio.actualNotes, pendingRatio.normalNotes)"
            >
              Change
            </button>
          </div>
        </div>

        <TagRollTupletMiniRoll
          :draft="draft"
          :project="project"
          :selected-slot="selectedSlot"
          @update:slots="onSlotsUpdate"
          @update:selected-slot="selectedSlot = $event"
          @audition-note="emit('auditionNote', $event)"
          @preview-pitch="emit('previewPitch', $event)"
        />

        <div class="lyrics" role="group" aria-label="Slot lyrics">
          <label
            v-for="(slot, i) in draft.slots"
            :key="`ly-${i}`"
            class="lyric"
            :class="{ on: selectedSlot === i }"
          >
            <span class="lyric-lab">{{ i + 1 }}</span>
            <input
              class="lyric-input"
              type="text"
              maxlength="24"
              :value="slot.lyric ?? ''"
              :aria-label="`Slot ${i + 1} lyric`"
              placeholder="—"
              @focus="selectedSlot = i"
              @input="setSlotLyric(i, ($event.target as HTMLInputElement).value)"
            />
          </label>
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
  width: min(48rem, 100%);
  max-height: min(
    48rem,
    calc(100dvh - 2rem - var(--bottom-nav-h, 3.75rem) - env(safe-area-inset-bottom))
  );
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
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
  flex: 0 0 auto;
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
  font-size: 0.92rem;
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
.ratio-row {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 0.55rem 0.65rem;
  flex: 0 0 auto;
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
.ratio-field {
  display: grid;
  gap: 0.2rem;
}
.ratio-lab {
  font-size: 0.72rem;
  font-weight: 650;
  color: var(--muted);
}
.ratio-input {
  width: 3.6rem;
  min-height: 2.2rem;
  padding: 0.3rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg, var(--surface));
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
}
.ratio-colon {
  font-weight: 700;
  color: var(--muted);
  padding-bottom: 0.45rem;
}
.preset-warn {
  display: grid;
  gap: 0.55rem;
  padding: 0.7rem 0.8rem;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  flex: 0 0 auto;
}
.preset-warn p {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.4;
}
.preset-warn-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.45rem;
}
.lyrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(3.5rem, 1fr));
  gap: 0.35rem;
  flex: 0 0 auto;
}
.lyric {
  display: grid;
  gap: 0.15rem;
}
.lyric.on .lyric-lab {
  color: var(--text);
}
.lyric-lab {
  font-size: 0.7rem;
  font-weight: 650;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.lyric-input {
  min-height: 2rem;
  padding: 0.25rem 0.35rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg, var(--surface));
  color: inherit;
  font: inherit;
  font-size: 0.85rem;
}
.lyric.on .lyric-input {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.05rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
  flex: 0 0 auto;
}
.spacer {
  flex: 1 1 auto;
  min-width: 0.5rem;
}
</style>
