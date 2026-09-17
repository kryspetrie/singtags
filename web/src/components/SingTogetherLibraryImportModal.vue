<script setup lang="ts">
/**
 * Import from My Library: select entries, then optionally set voicing + part confidence.
 */
import { computed, nextTick, ref, watch } from 'vue'
import type { LocalEntry } from '../types/localLibrary'
import { matchLocalLibraryQuery, localLibraryKeyLabel } from '../types/localLibrary'
import {
  VOICINGS,
  partLabel,
  partsForVoicing,
  type Confidence,
  type Voicing,
} from '../lib/singTogether/types'
import type { LibraryImportDraft } from '../stores/singTogether'
import PartConfidenceRate from './PartConfidenceRate.vue'

const props = defineProps<{
  open: boolean
  entries: readonly LocalEntry[]
  /** Library entry ids already linked in repertoire. */
  linkedEntryIds: readonly string[]
}>()

const emit = defineEmits<{
  close: []
  pick: [drafts: LibraryImportDraft[]]
}>()

type Step = 'select' | 'configure'

type DraftRow = {
  entryId: string
  title: string
  arranger: string
  key?: string
  voicing: Voicing | ''
  parts: Record<string, Confidence>
}

const step = ref<Step>('select')
const query = ref('')
const selectedIds = ref<Set<string>>(new Set())
const drafts = ref<DraftRow[]>([])
const searchEl = ref<HTMLInputElement | null>(null)

const linkedSet = computed(() => new Set(props.linkedEntryIds))

const availableEntries = computed(() =>
  props.entries.filter((e) => !linkedSet.value.has(e.id)),
)

const filteredEntries = computed(() => {
  const q = query.value
  return availableEntries.value.filter((e) => matchLocalLibraryQuery(e, q))
})

const selectedCount = computed(() => selectedIds.value.size)

watch(
  () => props.open,
  async (on) => {
    if (!on) return
    step.value = 'select'
    query.value = ''
    selectedIds.value = new Set()
    drafts.value = []
    await nextTick()
    searchEl.value?.focus()
  },
)

function toggle(id: string): void {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function selectAllFiltered(): void {
  const next = new Set(selectedIds.value)
  for (const e of filteredEntries.value) next.add(e.id)
  selectedIds.value = next
}

function clearSelection(): void {
  selectedIds.value = new Set()
}

function goConfigure(): void {
  if (!selectedIds.value.size) return
  const byId = new Map(props.entries.map((e) => [e.id, e]))
  const rows: DraftRow[] = []
  for (const id of selectedIds.value) {
    const e = byId.get(id)
    if (!e) continue
    rows.push({
      entryId: e.id,
      title: e.title.trim() || 'Untitled',
      arranger: e.arranger.trim(),
      key: e.key?.trim() || undefined,
      voicing: '',
      parts: {},
    })
  }
  rows.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
  drafts.value = rows
  step.value = 'configure'
}

function backToSelect(): void {
  step.value = 'select'
}

function setDraftVoicing(row: DraftRow, raw: string): void {
  const voicing = raw ? (raw as Voicing) : ''
  row.voicing = voicing
  row.parts = {}
}

function draftPartConfidence(row: DraftRow, partId: string): Confidence | null {
  return Object.prototype.hasOwnProperty.call(row.parts, partId)
    ? (row.parts[partId] ?? 0)
    : null
}

function setDraftPartConfidence(row: DraftRow, partId: string, value: Confidence | null): void {
  const parts = { ...row.parts }
  if (value == null) delete parts[partId]
  else parts[partId] = value
  row.parts = parts
}

function applyAllParts(row: DraftRow, mode: 'off-book' | 'on-book' | 'clear'): void {
  if (mode === 'clear') {
    row.parts = {}
    return
  }
  const conf: Confidence = mode === 'off-book' ? 5 : 3
  const parts: Record<string, Confidence> = {}
  for (const pid of partsForVoicing(row.voicing || undefined)) {
    parts[pid] = conf
  }
  row.parts = parts
}

function keyLabel(key: string | undefined): string {
  if (!key) return ''
  return localLibraryKeyLabel(key) || key
}

function submit(): void {
  if (!drafts.value.length) return
  const out: LibraryImportDraft[] = drafts.value.map((d) => ({
    entryId: d.entryId,
    title: d.title,
    arranger: d.arranger,
    key: d.key,
    voicing: d.voicing || undefined,
    parts: { ...d.parts },
  }))
  emit('pick', out)
  emit('close')
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === 'Escape') {
    ev.preventDefault()
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="lib-import-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="st-lib-import-title"
      tabindex="-1"
      @keydown="onKeydown"
    >
      <button type="button" class="backdrop" aria-label="Close" @click="emit('close')" />
      <div class="panel">
        <header class="head">
          <div class="head-text">
            <h2 id="st-lib-import-title" class="title">Import from My Library</h2>
            <p class="step-lbl">
              {{ step === 'select' ? 'Step 1 — Select songs' : 'Step 2 — Parts & details' }}
            </p>
          </div>
          <button type="button" class="btn ghost" aria-label="Close" @click="emit('close')">
            ✕
          </button>
        </header>

        <div v-if="step === 'select'" class="body">
          <p class="lead">
            Choose library songs to add to your repertoire. Title, arranger, and key stay linked to
            My Library.
          </p>

          <div class="search-row">
            <input
              ref="searchEl"
              v-model="query"
              type="search"
              enterkeyhint="search"
              autocomplete="off"
              autocorrect="off"
              spellcheck="false"
              placeholder="Search library…"
              aria-label="Search My Library"
            />
          </div>

          <div class="select-actions" role="group" aria-label="Selection">
            <button
              type="button"
              class="btn ghost"
              :disabled="!filteredEntries.length"
              @click="selectAllFiltered"
            >
              Select shown
            </button>
            <button
              type="button"
              class="btn ghost"
              :disabled="!selectedCount"
              @click="clearSelection"
            >
              Clear
            </button>
            <span class="sel-count">{{ selectedCount }} selected</span>
          </div>

          <ul v-if="filteredEntries.length" class="pick-list" role="listbox" aria-label="Library songs">
            <li v-for="e in filteredEntries" :key="e.id">
              <label class="pick">
                <input
                  type="checkbox"
                  :checked="selectedIds.has(e.id)"
                  @change="toggle(e.id)"
                />
                <span class="pick-main">
                  <span class="pick-title">{{ e.title || 'Untitled' }}</span>
                  <span v-if="e.arranger.trim()" class="pick-meta">{{ e.arranger.trim() }}</span>
                  <span v-if="e.key" class="pick-meta">{{ keyLabel(e.key) }}</span>
                </span>
              </label>
            </li>
          </ul>
          <p v-else class="empty">
            {{
              availableEntries.length
                ? 'No library songs match this search.'
                : linkedSet.size
                  ? 'All library songs are already in your repertoire.'
                  : 'Your My Library is empty.'
            }}
          </p>
        </div>

        <div v-else class="body">
          <p class="lead">
            Optionally set voicing and which parts you know. Library fields stay read-only after
            import.
          </p>

          <div class="draft-list">
            <article v-for="row in drafts" :key="row.entryId" class="draft-card">
              <header class="draft-head">
                <h3 class="draft-title">{{ row.title }}</h3>
                <p class="draft-meta">
                  <span v-if="row.arranger">{{ row.arranger }}</span>
                  <span v-if="row.key">{{ keyLabel(row.key) }}</span>
                  <span class="from-lib">From My Library</span>
                </p>
              </header>

              <label class="draft-field">
                <span class="draft-lbl">Voicing</span>
                <select
                  class="draft-select"
                  :value="row.voicing"
                  aria-label="Voicing"
                  @change="setDraftVoicing(row, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">Unspecified</option>
                  <option v-for="v in VOICINGS" :key="v" :value="v">{{ v }}</option>
                </select>
              </label>

              <div class="draft-parts" role="group" :aria-label="`Parts for ${row.title}`">
                <PartConfidenceRate
                  v-for="pid in partsForVoicing(row.voicing || undefined)"
                  :key="pid"
                  :label="partLabel(pid)"
                  :model-value="draftPartConfidence(row, pid)"
                  @update:model-value="setDraftPartConfidence(row, pid, $event)"
                />
              </div>
              <div class="draft-presets" role="group" aria-label="Part presets">
                <button type="button" class="btn ghost sm" @click="applyAllParts(row, 'off-book')">
                  Off book
                </button>
                <button type="button" class="btn ghost sm" @click="applyAllParts(row, 'on-book')">
                  On book
                </button>
                <button type="button" class="btn ghost sm" @click="applyAllParts(row, 'clear')">
                  Clear parts
                </button>
              </div>
            </article>
          </div>
        </div>

        <footer class="actions">
          <template v-if="step === 'select'">
            <button type="button" class="btn ghost" @click="emit('close')">Cancel</button>
            <button
              type="button"
              class="btn btn-primary"
              :disabled="!selectedCount"
              @click="goConfigure"
            >
              Next ({{ selectedCount || 0 }})
            </button>
          </template>
          <template v-else>
            <button type="button" class="btn ghost" @click="backToSelect">Back</button>
            <button type="button" class="btn btn-primary" @click="submit">
              Import {{ drafts.length }}
            </button>
          </template>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.lib-import-root {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: grid;
  place-items: center;
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
  max-height: min(88vh, 42rem);
  overflow: auto;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 0.75rem;
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
.head-text {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}
.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  line-height: 1.25;
}
.step-lbl {
  margin: 0;
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 650;
}
.body {
  display: grid;
  gap: 0.55rem;
  min-height: 0;
  align-content: start;
}
.lead {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.4;
}
.search-row input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 16px;
}
.select-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.5rem;
}
.sel-count {
  margin-left: auto;
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 650;
}
.pick-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.2rem;
  max-height: min(48vh, 22rem);
  overflow: auto;
}
.pick {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  padding: 0.45rem 0.4rem;
  border-radius: 10px;
  cursor: pointer;
}
.pick:hover {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.pick input {
  margin-top: 0.2rem;
  width: 1.1rem;
  height: 1.1rem;
  flex-shrink: 0;
}
.pick-main {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 0.55rem;
  min-width: 0;
}
.pick-title {
  font-weight: 650;
}
.pick-meta {
  color: var(--muted);
  font-size: 0.88rem;
}
.empty {
  margin: 0.5rem 0 0;
  color: var(--muted);
  font-size: 0.92rem;
}
.draft-list {
  display: grid;
  gap: 0.75rem;
}
.draft-card {
  display: grid;
  gap: 0.45rem;
  padding: 0.65rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface) 92%, var(--text));
}
.draft-head {
  display: grid;
  gap: 0.15rem;
}
.draft-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}
.draft-meta {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.65rem;
  color: var(--muted);
  font-size: 0.85rem;
}
.from-lib {
  font-weight: 650;
  color: var(--accent);
}
.draft-field {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.4rem;
  align-items: center;
}
.draft-lbl {
  font-size: 0.72rem;
  font-weight: 650;
  color: var(--muted);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.draft-select {
  box-sizing: border-box;
  width: max-content;
  max-width: 100%;
  min-height: 40px;
  padding: 0.3rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 16px;
}
.draft-parts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.draft-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
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
  opacity: 0.45;
  cursor: not-allowed;
}
.btn.ghost {
  border-color: transparent;
  background: transparent;
  min-height: 36px;
  padding: 0.25rem 0.45rem;
  font-weight: 500;
}
.btn.sm {
  min-height: 36px;
  padding: 0.25rem 0.55rem;
  font-size: 0.85rem;
}
.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
</style>
