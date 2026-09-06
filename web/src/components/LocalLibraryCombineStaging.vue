<script setup lang="ts">
/**
 * Staging step for “Import as one song”: assign roles before creating the entry.
 */
import { computed, ref, watch } from 'vue'
import LocalAssetPreview from './LocalAssetPreview.vue'
import {
  defaultTrackLabel,
  guessPartIdFromFilename,
  guessSongTitleFromFilenames,
} from '../lib/localAssetHeuristics'
import { PRIMARY_PARTS, partLabel } from '../lib/parts'
import {
  LOCAL_ASSET_ROLES,
  guessAssetRoles,
  guessLocalMime,
  localAssetRoleLabel,
  titleFromFilename,
  type LocalAssetRole,
} from '../types/localLibrary'

const props = defineProps<{
  files: File[]
  busy?: boolean
  heading?: string
}>()

const emit = defineEmits<{
  confirm: [
    payload: {
      files: File[]
      roles: LocalAssetRole[]
      labels: string[]
      partIds: Array<string | null>
      title: string
    },
  ]
  cancel: []
}>()

type Row = { file: File; role: LocalAssetRole; label: string; partId: string }

const PART_CHOICES = [
  { value: '', label: 'Auto / custom' },
  ...PRIMARY_PARTS.map((id) => ({ value: id, label: partLabel(id) })),
]

const rows = ref<Row[]>([])
const title = ref('')

const canConfirm = computed(() => rows.value.length > 0 && !!title.value.trim())

watch(
  () => props.files,
  (files) => {
    const roles = guessAssetRoles(files.map((f) => ({ mime: guessLocalMime(f), filename: f.name })))
    rows.value = files.map((file, i) => {
      const role = roles[i] ?? 'other'
      const partId = role === 'track' ? guessPartIdFromFilename(file.name) ?? '' : ''
      return {
        file,
        role,
        partId,
        label:
          role === 'track'
            ? defaultTrackLabel(file.name, partId || null)
            : titleFromFilename(file.name),
      }
    })
    title.value = guessSongTitleFromFilenames(files.map((f) => f.name)) || 'Untitled'
  },
  { immediate: true },
)

function move(index: number, delta: number): void {
  const next = index + delta
  if (next < 0 || next >= rows.value.length) return
  const copy = [...rows.value]
  const [item] = copy.splice(index, 1)
  copy.splice(next, 0, item!)
  rows.value = copy
}

function onConfirm(): void {
  if (!canConfirm.value || props.busy) return
  emit('confirm', {
    files: rows.value.map((r) => r.file),
    roles: rows.value.map((r) => r.role),
    labels: rows.value.map((r) => r.label),
    partIds: rows.value.map((r) => (r.role === 'track' ? r.partId.trim() || null : null)),
    title: title.value.trim(),
  })
}

function blobForRow(row: Row): () => Promise<Blob | null> {
  return async () => row.file
}
</script>

<template>
  <div class="stage" role="dialog" aria-modal="true" aria-labelledby="combine-title">
    <div class="panel">
      <header class="head">
        <h2 id="combine-title" class="title">{{ heading || 'Review import' }}</h2>
        <p class="desc">Confirm roles and voice parts before saving. Blank part = auto from filename.</p>
      </header>

      <label class="field">
        Song title
        <input v-model="title" type="text" maxlength="200" autocomplete="off" />
      </label>

      <ul class="rows" aria-label="Files to combine">
        <li v-for="(row, i) in rows" :key="`${row.file.name}-${i}`" class="row">
          <div class="file-head">
            <div class="file-name">{{ row.file.name }}</div>
            <LocalAssetPreview
              :mime="guessLocalMime(row.file)"
              :filename="row.file.name"
              :get-blob="blobForRow(row)"
            />
          </div>
          <label class="mini">
            Label
            <input v-model="row.label" type="text" maxlength="120" />
          </label>
          <label class="mini">
            Role
            <select v-model="row.role">
              <option v-for="r in LOCAL_ASSET_ROLES" :key="r" :value="r">
                {{ localAssetRoleLabel(r) }}
              </option>
            </select>
          </label>
          <label v-if="row.role === 'track'" class="mini">
            Part
            <select v-model="row.partId">
              <option v-for="p in PART_CHOICES" :key="p.value || 'auto'" :value="p.value">
                {{ p.label }}
              </option>
            </select>
          </label>
          <div class="order">
            <button type="button" class="btn btn-ghost" :disabled="i === 0" @click="move(i, -1)">
              ↑
            </button>
            <button
              type="button"
              class="btn btn-ghost"
              :disabled="i >= rows.length - 1"
              @click="move(i, 1)"
            >
              ↓
            </button>
          </div>
        </li>
      </ul>

      <div class="actions">
        <button type="button" class="btn btn-ghost" :disabled="busy" @click="emit('cancel')">
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="busy || !canConfirm"
          @click="onConfirm"
        >
          {{ busy ? 'Saving…' : 'Save song' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stage {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: end center;
  padding: 0.75rem;
  padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));
  background: color-mix(in srgb, #000 45%, transparent);
}
.panel {
  width: min(36rem, 100%);
  max-height: min(92vh, 52rem);
  overflow: auto;
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.22);
}
.head {
  display: grid;
  gap: 0.25rem;
}
.title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 750;
}
.desc {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.4;
}
.field,
.mini {
  display: grid;
  gap: 0.25rem;
  font-size: 0.85rem;
  font-weight: 600;
}
.field input,
.mini input,
.mini select {
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 16px;
  font-weight: 400;
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.65rem;
}
.row {
  display: grid;
  gap: 0.45rem;
  padding: 0.7rem;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.file-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  justify-content: space-between;
}
.file-name {
  flex: 1 1 10rem;
  font-size: 0.82rem;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.order {
  display: flex;
  gap: 0.25rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  justify-content: flex-end;
}
.btn {
  min-height: 44px;
  padding: 0.45rem 0.85rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}
.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.btn-ghost {
  background: transparent;
}
.actions .btn-ghost {
  margin-right: auto;
}
@media (min-width: 640px) {
  .stage {
    place-items: center;
  }
}
</style>
