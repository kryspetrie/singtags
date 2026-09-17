<script setup lang="ts">
/**
 * Sing Together: paste songs as CSV-shaped rows with a chosen column order.
 */
import { computed, nextTick, ref, watch } from 'vue'
import {
  REPERTOIRE_CSV_COLUMNS,
  type RepertoireCsvColumn,
} from '../lib/singTogether/csv'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  pick: [text: string, columns: RepertoireCsvColumn[]]
}>()

const text = ref('')
const columns = ref<RepertoireCsvColumn[]>(['title'])
const textareaEl = ref<HTMLTextAreaElement | null>(null)

const COLUMN_HINT: Record<RepertoireCsvColumn, string> = {
  title: 'required',
  alt_titles: 'AKA; nicknames',
  arranger: 'optional',
  key: 'display only',
  voicing: 'TTBB / SSAA / SATB',
  parts: 'tenor;lead…',
  confidence: 'tenor:5;lead:3',
  tag: 'X / true / yes',
}

const unusedColumns = computed(() =>
  REPERTOIRE_CSV_COLUMNS.filter((c) => !columns.value.includes(c)),
)

const placeholder = computed(() => {
  if (columns.value.length === 1 && columns.value[0] === 'title') {
    return 'Heart of My Heart\nGoodnight Sweetheart\nHello Mary Lou'
  }
  return columns.value.join(',') + '\n' + columns.value.map((c) => (c === 'title' ? 'Song Title' : '')).join(',')
})

watch(
  () => props.open,
  async (on) => {
    if (!on) return
    text.value = ''
    columns.value = ['title']
    await nextTick()
    textareaEl.value?.focus()
  },
)

function addColumn(col: RepertoireCsvColumn): void {
  if (columns.value.includes(col)) return
  columns.value = [...columns.value, col]
}

function removeColumn(index: number): void {
  const col = columns.value[index]
  if (col === 'title') return
  columns.value = columns.value.filter((_, i) => i !== index)
}

function moveColumn(index: number, dir: -1 | 1): void {
  const j = index + dir
  if (j < 0 || j >= columns.value.length) return
  const next = [...columns.value]
  const tmp = next[index]!
  next[index] = next[j]!
  next[j] = tmp
  columns.value = next
}

function setPreset(kind: 'title' | 'title-arranger' | 'full'): void {
  if (kind === 'title') columns.value = ['title']
  else if (kind === 'title-arranger') columns.value = ['title', 'arranger']
  else columns.value = [...REPERTOIRE_CSV_COLUMNS]
}

function submit(): void {
  const raw = text.value
  if (!raw.trim()) return
  if (!columns.value.includes('title')) return
  emit('pick', raw, [...columns.value])
  emit('close')
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
    ev.preventDefault()
    submit()
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="paste-modal-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="st-paste-songs-title"
      tabindex="-1"
      @keydown.escape.prevent="emit('close')"
    >
      <button type="button" class="backdrop" aria-label="Close" @click="emit('close')" />
      <div class="panel">
        <header class="head">
          <h2 id="st-paste-songs-title" class="title">Paste songs</h2>
          <button type="button" class="btn ghost" aria-label="Close" @click="emit('close')">
            ✕
          </button>
        </header>

        <div class="body">
          <p class="lead">
            One song per line. Use commas between fields in the column order below (same values as
            CSV import). A header row is optional — if present, it overrides this order.
          </p>

          <div class="presets" role="group" aria-label="Column presets">
            <button type="button" class="preset" @click="setPreset('title')">Title only</button>
            <button type="button" class="preset" @click="setPreset('title-arranger')">
              Title + arranger
            </button>
            <button type="button" class="preset" @click="setPreset('full')">All columns</button>
          </div>

          <div class="cols-block">
            <span class="cols-label">Column order</span>
            <div class="col-order" role="list" aria-label="Selected columns in order">
              <div
                v-for="(col, i) in columns"
                :key="`${col}-${i}`"
                class="col-chip"
                role="listitem"
              >
                <span class="col-name">{{ col }}</span>
                <span class="col-hint">{{ COLUMN_HINT[col] }}</span>
                <span class="col-move">
                  <button
                    type="button"
                    class="iconish"
                    :disabled="i === 0"
                    aria-label="Move earlier"
                    @click="moveColumn(i, -1)"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    class="iconish"
                    :disabled="i === columns.length - 1"
                    aria-label="Move later"
                    @click="moveColumn(i, 1)"
                  >
                    ›
                  </button>
                </span>
                <button
                  v-if="col !== 'title'"
                  type="button"
                  class="iconish"
                  :aria-label="`Remove ${col}`"
                  @click="removeColumn(i)"
                >
                  ×
                </button>
              </div>
            </div>
            <div v-if="unusedColumns.length" class="col-add" role="group" aria-label="Add column">
              <span class="cols-label">Add</span>
              <button
                v-for="col in unusedColumns"
                :key="col"
                type="button"
                class="add-chip"
                @click="addColumn(col)"
              >
                + {{ col }}
              </button>
            </div>
          </div>

          <label class="field">
            <span class="sr-only">Songs to paste</span>
            <textarea
              ref="textareaEl"
              v-model="text"
              class="titles-input"
              rows="10"
              :placeholder="placeholder"
              autocomplete="off"
              spellcheck="true"
              @keydown="onKeydown"
            />
          </label>
          <p class="hint">
            Order: <code>{{ columns.join(', ') }}</code>. Duplicate titles are skipped.
            <span class="hint-kbd">Ctrl/⌘+Enter</span> to add.
          </p>
        </div>

        <div class="actions sticky-actions">
          <button type="button" class="btn ghost" @click="emit('close')">Cancel</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!text.trim() || !columns.includes('title')"
            @click="submit"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.paste-modal-root {
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
  width: min(32rem, 100%);
  max-height: min(90vh, 42rem);
  overflow: auto;
  display: grid;
  gap: 0.85rem;
  padding: 1.1rem 1.15rem 1.15rem;
  border-radius: var(--radius, 12px);
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}
.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  line-height: 1.25;
}
.body {
  display: grid;
  gap: 0.55rem;
}
.lead,
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.4;
}
.hint-kbd {
  white-space: nowrap;
  font-size: 0.88em;
}
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.preset,
.add-chip {
  min-height: 36px;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.preset:hover,
.add-chip:hover {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}
.cols-block {
  display: grid;
  gap: 0.4rem;
}
.cols-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}
.col-order,
.col-add {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}
.col-chip {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.35rem;
  max-width: 100%;
  padding: 0.25rem 0.35rem 0.25rem 0.55rem;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.col-name {
  font-weight: 700;
  font-size: 0.88rem;
  font-family: ui-monospace, monospace;
}
.col-hint {
  font-size: 0.75rem;
  color: var(--muted);
}
.col-move {
  display: inline-flex;
  gap: 0.1rem;
}
.iconish {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  min-height: 28px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}
.iconish:hover:not(:disabled) {
  color: var(--text);
  background: color-mix(in srgb, var(--border) 40%, transparent);
}
.iconish:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.field {
  display: grid;
  gap: 0.25rem;
}
.titles-input {
  width: 100%;
  min-height: 10rem;
  resize: vertical;
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg, var(--surface));
  color: var(--text);
  font: inherit;
  line-height: 1.4;
}
.titles-input:focus {
  outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
  outline-offset: 1px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}
.sticky-actions {
  position: sticky;
  bottom: 0;
  margin: 0 -1.15rem -1.15rem;
  padding: 0.75rem 1.15rem 1.15rem;
  background: linear-gradient(
    to top,
    var(--surface) 70%,
    color-mix(in srgb, var(--surface) 85%, transparent)
  );
  border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
}
.btn {
  min-height: 44px;
  padding: 0.45rem 0.9rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn.ghost {
  border-color: transparent;
  background: transparent;
  min-height: 36px;
  padding: 0.25rem 0.45rem;
  font-weight: 500;
}
.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
