<script setup lang="ts">
/**
 * Staging UI to merge multiple Local Library entries into one song.
 */
import { computed, ref, watch } from 'vue'
import {
  LOCAL_ASSET_ROLES,
  localAssetRoleLabel,
  type LocalAsset,
  type LocalAssetRole,
  type LocalEntry,
} from '../types/localLibrary'

export type MergeStagingEntry = {
  entry: LocalEntry
  assets: LocalAsset[]
}

const props = defineProps<{
  entries: MergeStagingEntry[]
  busy?: boolean
}>()

const emit = defineEmits<{
  confirm: [
    payload: {
      targetId: string
      sourceIds: string[]
      assets: Array<{ id: string; role: LocalAssetRole; label: string }>
      title: string
      appendNotes: boolean
    },
  ]
  cancel: []
}>()

type Row = {
  id: string
  fromEntryId: string
  fromTitle: string
  filename: string
  role: LocalAssetRole
  label: string
}

const targetId = ref('')
const title = ref('')
const appendNotes = ref(false)
const rows = ref<Row[]>([])

function defaultTargetId(list: MergeStagingEntry[]): string {
  const withSheet = list.find((e) =>
    e.assets.some((a) => a.role === 'sheet' || a.mime === 'application/pdf'),
  )
  return withSheet?.entry.id ?? list[0]?.entry.id ?? ''
}

function demoteExtraSheets(list: Row[]): Row[] {
  let seenSheet = false
  return list.map((row) => {
    if (row.role !== 'sheet') return row
    if (!seenSheet) {
      seenSheet = true
      return row
    }
    return { ...row, role: 'alternateSheet' as const }
  })
}

function rebuildRows(list: MergeStagingEntry[], keepTarget?: string): void {
  const tid = keepTarget && list.some((e) => e.entry.id === keepTarget)
    ? keepTarget
    : defaultTargetId(list)
  targetId.value = tid
  const target = list.find((e) => e.entry.id === tid)
  title.value = target?.entry.title ?? 'Untitled'
  const ordered = [
    ...list.filter((e) => e.entry.id === tid),
    ...list.filter((e) => e.entry.id !== tid),
  ]
  const next: Row[] = []
  for (const item of ordered) {
    for (const a of item.assets) {
      next.push({
        id: a.id,
        fromEntryId: item.entry.id,
        fromTitle: item.entry.title,
        filename: a.filename,
        role: a.role,
        label: a.label,
      })
    }
  }
  rows.value = demoteExtraSheets(next)
}

watch(
  () => props.entries,
  (list) => {
    rebuildRows(list)
    appendNotes.value = false
  },
  { immediate: true },
)

watch(targetId, (tid) => {
  const target = props.entries.find((e) => e.entry.id === tid)
  if (target) title.value = target.entry.title
})

const canConfirm = computed(
  () =>
    props.entries.length >= 2 &&
    !!targetId.value &&
    rows.value.length > 0 &&
    !!title.value.trim(),
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
  const sourceIds = props.entries
    .map((e) => e.entry.id)
    .filter((id) => id !== targetId.value)
  emit('confirm', {
    targetId: targetId.value,
    sourceIds,
    assets: rows.value.map((r) => ({ id: r.id, role: r.role, label: r.label })),
    title: title.value.trim(),
    appendNotes: appendNotes.value,
  })
}
</script>

<template>
  <div class="stage" role="dialog" aria-modal="true" aria-labelledby="merge-title">
    <div class="panel">
      <header class="head">
        <h2 id="merge-title" class="title">Merge songs</h2>
        <p class="desc">
          Combine into one song. Source songs are removed after their files move over.
        </p>
      </header>

      <fieldset class="target">
        <legend>Keep as song</legend>
        <label v-for="item in entries" :key="item.entry.id" class="target-opt">
          <input v-model="targetId" type="radio" name="merge-target" :value="item.entry.id" />
          <span>
            <strong>{{ item.entry.title }}</strong>
            <span class="text-muted">
              · {{ item.assets.length }} file{{ item.assets.length === 1 ? '' : 's' }}
            </span>
          </span>
        </label>
      </fieldset>

      <label class="field">
        Song title
        <input v-model="title" type="text" maxlength="200" autocomplete="off" />
      </label>

      <label class="notes-opt" title="Append notes from the other songs">
        <input v-model="appendNotes" type="checkbox" />
        Append notes from merged songs
      </label>

      <ul class="rows" aria-label="Files after merge">
        <li v-for="(row, i) in rows" :key="row.id" class="row">
          <div class="file-name">
            {{ row.filename }}
            <span class="from">from {{ row.fromTitle }}</span>
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
          {{ busy ? 'Merging…' : 'Merge songs' }}
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
.target {
  margin: 0;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  display: grid;
  gap: 0.4rem;
}
.target legend {
  padding: 0 0.25rem;
  font-size: 0.85rem;
  font-weight: 700;
}
.target-opt {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.92rem;
  cursor: pointer;
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
.notes-opt {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
  user-select: none;
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
.file-name {
  font-size: 0.82rem;
  font-weight: 600;
  word-break: break-word;
  display: grid;
  gap: 0.15rem;
}
.from {
  font-weight: 500;
  color: var(--muted);
  font-size: 0.78rem;
}
.order {
  display: flex;
  gap: 0.35rem;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.text-muted {
  color: var(--muted);
  font-weight: 500;
}
</style>
