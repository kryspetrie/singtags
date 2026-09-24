<script setup lang="ts">
/**
 * Lyrics bottom lane — type syllables per note on the active part (Space / Dash advance).
 * Opened from the media-bar toggle (not auto on selection).
 */
import { computed, ref, watch } from 'vue'
import { notesForPartSorted } from '../../lib/tagRoll/notesAtTick'
import { usePreferencesStore } from '../../stores/preferences'
import { useTagRollStore } from '../../stores/tagRoll'
import TagRollBottomLaneShell from './TagRollBottomLaneShell.vue'

const props = defineProps<{
  leftGutterPx?: number
}>()

const store = useTagRollStore()
const prefs = usePreferencesStore()

const buffer = ref('')
const lyricCursorNoteId = ref<string | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

const project = computed(() => store.current)
const activePartId = computed(() => project.value?.view.activePartId ?? null)
const collapsed = computed(() => prefs.tagRollLyricsLaneCollapsed)
const leftGutterPx = computed(() => Math.max(64, props.leftGutterPx ?? 112))
const open = computed(() => !collapsed.value)

const partNotes = computed(() => {
  const p = project.value
  const partId = activePartId.value
  if (!p || !partId) return []
  return notesForPartSorted(p.notes, partId)
})

const cursorNote = computed(() => {
  const id = lyricCursorNoteId.value
  if (!id) return null
  return partNotes.value.find((n) => n.id === id) ?? null
})

const cursorIndex = computed(() => {
  const id = lyricCursorNoteId.value
  if (!id) return -1
  return partNotes.value.findIndex((n) => n.id === id)
})

function initCursor(): void {
  const notes = partNotes.value
  if (!notes.length) {
    lyricCursorNoteId.value = null
    buffer.value = ''
    return
  }
  const selected = store.selectedNoteId
  const hit = selected && notes.some((n) => n.id === selected) ? selected : notes[0]!.id
  lyricCursorNoteId.value = hit
  const note = notes.find((n) => n.id === hit)
  buffer.value = note?.lyric ?? ''
}

/** Lane open ↔ lyrics editor mode (parent also syncs on unmount). */
watch(
  open,
  (on) => {
    if (on) {
      if (project.value?.view.mode !== 'lyrics') store.setMode('lyrics')
      initCursor()
      queueMicrotask(() => inputRef.value?.focus())
    }
  },
  { immediate: true },
)

watch([activePartId, () => project.value?.id], () => {
  if (open.value) initCursor()
})

/** Clicking a note in the roll moves the lyric cursor onto that note. */
watch(
  () => store.selectedNoteId,
  (id) => {
    if (!open.value || !id) return
    const notes = partNotes.value
    if (!notes.some((n) => n.id === id)) return
    if (lyricCursorNoteId.value === id) return
    lyricCursorNoteId.value = id
    buffer.value = notes.find((n) => n.id === id)?.lyric ?? ''
    queueMicrotask(() => inputRef.value?.focus())
  },
)

function commitAndAdvance(text: string): void {
  const id = lyricCursorNoteId.value
  if (!id) return
  store.setLyric(id, text)
  buffer.value = ''
  const notes = partNotes.value
  const idx = notes.findIndex((n) => n.id === id)
  if (idx < 0 || idx >= notes.length - 1) return
  const next = notes[idx + 1]!
  lyricCursorNoteId.value = next.id
  buffer.value = next.lyric ?? ''
}

function goPrevious(): void {
  const id = lyricCursorNoteId.value
  if (!id) return
  const notes = partNotes.value
  const idx = notes.findIndex((n) => n.id === id)
  if (idx <= 0) return
  const prev = notes[idx - 1]!
  lyricCursorNoteId.value = prev.id
  buffer.value = prev.lyric ?? ''
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault()
    commitAndAdvance(buffer.value)
    return
  }
  if (e.key === '-' || e.key === 'Dash') {
    e.preventDefault()
    const base = buffer.value.replace(/-$/, '')
    commitAndAdvance(`${base}-`)
    return
  }
  if (e.key === 'Backspace' && buffer.value === '') {
    e.preventDefault()
    goPrevious()
  }
}
</script>

<template>
  <TagRollBottomLaneShell v-if="open" label="Lyrics" :left-gutter-px="leftGutterPx">
    <div class="lyr-body">
      <label class="wrap">
        <input
          ref="inputRef"
          v-model="buffer"
          class="inp"
          type="text"
          autocomplete="off"
          spellcheck="false"
          :placeholder="cursorNote ? 'Type syllable…' : 'No notes on this part'"
          :disabled="!cursorNote"
          aria-label="Lyric syllable"
          @keydown="onKeydown"
        />
      </label>
      <p class="hint">
        Space commits · Dash hyphen · Backspace (empty) back
        <template v-if="cursorIndex >= 0">
          · {{ cursorIndex + 1 }}/{{ partNotes.length }}
        </template>
      </p>
    </div>
  </TagRollBottomLaneShell>
</template>

<style scoped>
.lyr-body {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.2rem;
  min-height: 52px;
  margin: 0.3rem 0.15rem 0.3rem 0;
  padding: 0.25rem 0.45rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 92%, var(--bg, var(--surface)));
  box-sizing: border-box;
}
.wrap {
  display: flex;
  align-items: center;
  min-width: 0;
}
.inp {
  flex: 1 1 auto;
  min-height: 2rem;
  min-width: 0;
  width: 100%;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 1rem;
  font-weight: 650;
}
.inp:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.hint {
  margin: 0;
  font-size: 0.72rem;
  color: var(--muted);
  line-height: 1.25;
}
</style>
