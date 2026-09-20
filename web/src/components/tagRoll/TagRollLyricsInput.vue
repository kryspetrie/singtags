<script setup lang="ts">
/**
 * Lyrics mode: type syllables per note on the active part (Space / Dash advance).
 */
import { computed, ref, watch } from 'vue'
import { notesForPartSorted } from '../../lib/tagRoll/notesAtTick'
import { useTagRollStore } from '../../stores/tagRoll'

const store = useTagRollStore()

const buffer = ref('')
const lyricCursorNoteId = ref<string | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

const project = computed(() => store.current)
const mode = computed(() => project.value?.view.mode)
const activePartId = computed(() => project.value?.view.activePartId ?? null)

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

const visible = computed(
  () => mode.value === 'lyrics' && !!activePartId.value && !!project.value,
)

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

watch(
  [mode, activePartId, () => project.value?.id],
  () => {
    if (visible.value) initCursor()
  },
  { immediate: true },
)

/** Clicking a note in the roll moves the lyric cursor onto that note. */
watch(
  () => store.selectedNoteId,
  (id) => {
    if (!visible.value || !id) return
    const notes = partNotes.value
    if (!notes.some((n) => n.id === id)) return
    if (lyricCursorNoteId.value === id) return
    lyricCursorNoteId.value = id
    buffer.value = notes.find((n) => n.id === id)?.lyric ?? ''
    queueMicrotask(() => inputRef.value?.focus())
  },
)

watch(visible, (on) => {
  if (on) {
    queueMicrotask(() => inputRef.value?.focus())
  }
})

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
  <div v-if="visible" class="tr-lyr">
    <label class="wrap">
      <span class="lbl">Lyrics</span>
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
      Space commits · Dash commits with hyphen · Backspace (empty) goes back
      <template v-if="cursorIndex >= 0">
        · note {{ cursorIndex + 1 }}/{{ partNotes.length }}
      </template>
    </p>
  </div>
</template>

<style scoped>
.tr-lyr {
  display: grid;
  gap: 0.25rem;
}
.wrap {
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
.inp {
  flex: 1 1 12rem;
  min-height: 40px;
  min-width: 10rem;
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 1rem;
}
.inp:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--muted);
}
</style>
