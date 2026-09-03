<script setup lang="ts">
/**
 * Pick which Local Library assets to include in an optical transfer.
 * Defaults to the primary sheet (PDF/image); audio is off unless chosen.
 */
import { computed, ref, watch } from 'vue'
import type { LocalAsset } from '../types/localLibrary'
import {
  defaultOpticalTransferAssets,
  isLocalAudioMime,
  localAssetRoleLabel,
} from '../types/localLibrary'
import { formatBytes } from '../offline/storageEstimate'

const props = defineProps<{
  open: boolean
  title: string
  assets: LocalAsset[]
}>()

const emit = defineEmits<{
  close: []
  confirm: [assetIds: string[]]
}>()

const selected = ref<Set<string>>(new Set())

const defaultIds = computed(() => defaultOpticalTransferAssets(props.assets).map((a) => a.id))

const selectedBytes = computed(() =>
  props.assets
    .filter((a) => selected.value.has(a.id))
    .reduce((sum, a) => sum + a.byteLength, 0),
)

watch(
  () => [props.open, props.assets] as const,
  ([open]) => {
    if (!open) return
    selected.value = new Set(defaultIds.value)
  },
  { immediate: true },
)

function toggle(id: string): void {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function selectDefaults(): void {
  selected.value = new Set(defaultIds.value)
}

function selectAll(): void {
  selected.value = new Set(props.assets.map((a) => a.id))
}

function onConfirm(): void {
  emit('confirm', [...selected.value])
}

function isAudio(asset: LocalAsset): boolean {
  return asset.role === 'track' || isLocalAudioMime(asset.mime, asset.filename)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="sheet-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="local-tx-title"
    >
      <button type="button" class="backdrop" aria-label="Close" @click="emit('close')" />
      <div class="panel">
        <header class="head">
          <h2 id="local-tx-title" class="title">Transfer “{{ title }}”</h2>
          <p class="desc">
            Metadata is always included. By default only the primary sheet is sent — audio is usually
            too large for QR transfer.
          </p>
        </header>

        <div class="quick">
          <button type="button" class="linkish" @click="selectDefaults">Primary sheet</button>
          <button type="button" class="linkish" @click="selectAll">Select all</button>
        </div>

        <ul class="rows" aria-label="Assets to transfer">
          <li v-for="asset in assets" :key="asset.id" class="row">
            <label class="check">
              <input
                type="checkbox"
                :checked="selected.has(asset.id)"
                @change="toggle(asset.id)"
              />
              <span class="row-body">
                <span class="row-title">{{ asset.label || asset.filename }}</span>
                <span class="row-meta">
                  {{ localAssetRoleLabel(asset.role) }}
                  · {{ formatBytes(asset.byteLength) }}
                  <template v-if="isAudio(asset)"> · large</template>
                </span>
              </span>
            </label>
          </li>
        </ul>

        <p v-if="!assets.length" class="empty">No files on this song — metadata only.</p>

        <p class="total">Selected {{ formatBytes(selectedBytes) }}</p>

        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="emit('close')">Cancel</button>
          <button type="button" class="btn btn-primary" @click="onConfirm">
            Queue transfer
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet-root {
  position: fixed;
  inset: 0;
  z-index: 45;
  display: grid;
  place-items: end center;
  padding: 0.75rem;
  padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));
}
.backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: color-mix(in srgb, #000 45%, transparent);
  cursor: pointer;
}
.panel {
  position: relative;
  z-index: 1;
  width: min(36rem, 100%);
  max-height: min(88vh, 40rem);
  overflow: auto;
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.22);
}
.head {
  display: grid;
  gap: 0.3rem;
}
.title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 750;
}
.desc {
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.4;
}
.quick {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.linkish {
  border: none;
  background: none;
  color: var(--accent);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}
.row {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--muted) 4%, var(--surface));
}
.check {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.65rem 0.75rem;
  cursor: pointer;
}
.check input {
  margin-top: 0.2rem;
  width: 1.1rem;
  height: 1.1rem;
}
.row-body {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}
.row-title {
  font-weight: 650;
  overflow-wrap: anywhere;
}
.row-meta {
  font-size: 0.82rem;
  color: var(--muted);
}
.empty,
.total {
  margin: 0;
  font-size: 0.88rem;
  color: var(--muted);
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
  margin-right: auto;
}
@media (min-width: 640px) {
  .sheet-root {
    place-items: center;
  }
}
</style>
