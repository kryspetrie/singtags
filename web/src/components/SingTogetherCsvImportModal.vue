<script setup lang="ts">
/**
 * Sing Together CSV import: column docs, template download, and file pick.
 */
import { ref, watch } from 'vue'
import {
  REPERTOIRE_CSV_COLUMNS,
  REPERTOIRE_CSV_TEMPLATE_FILENAME,
  repertoireCsvTemplateText,
} from '../lib/singTogether/csv'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  pick: [text: string]
}>()

const fileInput = ref<HTMLInputElement | null>(null)

watch(
  () => props.open,
  (on) => {
    if (!on && fileInput.value) fileInput.value.value = ''
  },
)

function downloadTemplate(): void {
  const text = repertoireCsvTemplateText()
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = REPERTOIRE_CSV_TEMPLATE_FILENAME
  a.click()
  URL.revokeObjectURL(url)
}

function chooseFile(): void {
  fileInput.value?.click()
}

function onFile(ev: Event): void {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  void file.text().then((text) => {
    emit('pick', text)
    emit('close')
  })
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="csv-modal-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="st-csv-import-title"
      tabindex="-1"
      @keydown.escape.prevent="emit('close')"
    >
      <button type="button" class="backdrop" aria-label="Close" @click="emit('close')" />
      <div class="panel">
        <header class="head">
          <h2 id="st-csv-import-title" class="title">Import CSV</h2>
          <button type="button" class="btn ghost" aria-label="Close" @click="emit('close')">
            ✕
          </button>
        </header>

        <div class="body">
          <p class="lead">
            Import songs into your repertoire. Songs match across phones by title, arranger, and
            voicing (key is display-only).
          </p>

          <h3 class="subhead">Columns</h3>
          <ul class="cols">
            <li>
              <code>title</code> — required
            </li>
            <li>
              <code>alt_titles</code> — optional nicknames / short names (semicolon-separated), also
              <code>aka</code>
            </li>
            <li>
              <code>arranger</code> — optional; blank matches any arranger when hosting
            </li>
            <li>
              <code>key</code> — optional display only (e.g. Bb)
            </li>
            <li>
              <code>voicing</code> — optional:
              <code>TTBB</code>, <code>SSAA</code>, or <code>SATB</code>
            </li>
            <li>
              <code>parts</code> — optional; semicolon/comma list (e.g.
              <code>tenor;lead;bari;bass</code>). Leave blank to import a title stub and fill parts
              later. You can also put confidence on each part here (<code>tenor:5;lead:3</code>).
            </li>
            <li>
              <code>confidence</code> — preferred: per-part
              <code>tenor:5;lead:4;bari:3;bass:5</code> (1–5). A single number applies that rating
              to every part in <code>parts</code>.
            </li>
            <li>
              <code>tag</code> — optional; mark catalog tag vs My Library song. Affirmative:
              <code>X</code>, <code>true</code>, or <code>yes</code> (any case). Also
              <code>is_tag</code>.
            </li>
          </ul>
          <p class="hint">
            Header row recommended. Column order:
            {{ REPERTOIRE_CSV_COLUMNS.join(', ') }}.
          </p>
        </div>

        <div class="actions">
          <button type="button" class="btn" @click="downloadTemplate">Download CSV template</button>
          <button type="button" class="btn btn-primary" @click="chooseFile">Choose file…</button>
        </div>

        <input
          ref="fileInput"
          type="file"
          class="sr-only"
          accept=".csv,text/csv,text/plain"
          @change="onFile"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.csv-modal-root {
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
  max-height: min(85vh, 36rem);
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
.subhead {
  margin: 0.15rem 0 0;
  font-size: 0.95rem;
}
.cols {
  margin: 0;
  padding-left: 1.15rem;
  display: grid;
  gap: 0.35rem;
  font-size: 0.9rem;
  line-height: 1.35;
}
.cols code {
  font-size: 0.85em;
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
.btn:hover {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
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
