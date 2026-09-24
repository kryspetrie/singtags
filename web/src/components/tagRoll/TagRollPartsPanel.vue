<script setup lang="ts">
/**
 * Add / rename / recolor / delete Tag Studio parts; assign part hotkeys.
 */
import { computed, ref } from 'vue'
import ConfirmDialog from '../ConfirmDialog.vue'
import {
  displayHotkeyForPart,
  normalizePartHotkey,
  TAG_ROLL_RESERVED_HOTKEYS,
} from '../../lib/tagRoll/partHotkeys'
import { tagRollTip } from '../../lib/tagRoll/shortcuts'
import { useTagRollStore } from '../../stores/tagRoll'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useTagRollStore()
const newName = ref('Part')
const newColor = ref('#6b7280')
const newHotkey = ref('')
const pendingDelete = ref<{ id: string; name: string } | null>(null)

const project = computed(() => store.current)
const parts = computed(() => project.value?.parts ?? [])
const canDelete = computed(() => parts.value.length > 1)
const pendingDeleteMessage = computed(() => {
  const p = pendingDelete.value
  return p ? `Delete part “${p.name}” and its notes?` : ''
})

function onAdd(): void {
  const hk = normalizePartHotkey(newHotkey.value)
  store.addPart(newName.value, newColor.value, hk)
  newName.value = 'Part'
  newHotkey.value = ''
}

function onDelete(id: string, name: string): void {
  if (!canDelete.value) return
  pendingDelete.value = { id, name }
}

function cancelPendingDelete(): void {
  pendingDelete.value = null
}

function confirmPendingDelete(): void {
  const pending = pendingDelete.value
  pendingDelete.value = null
  if (!pending || !canDelete.value) return
  store.removePart(pending.id)
}

function onHotkeyChange(id: string, raw: string): void {
  const trimmed = raw.trim()
  if (!trimmed) {
    store.updatePart(id, { hotkey: undefined })
    return
  }
  const hk = normalizePartHotkey(trimmed)
  if (!hk) return
  store.updatePart(id, { hotkey: hk })
}
</script>

<template>
  <div v-if="open && project" class="tr-parts" role="dialog" aria-label="Parts">
    <header class="head">
      <h2 class="title">Parts</h2>
      <button
        type="button"
        class="btn ghost"
        :aria-label="tagRollTip('Close', 'Esc')"
        :title="tagRollTip('Close', 'Esc')"
        @click="emit('close')"
      >
        ✕
      </button>
    </header>

    <p class="hint">
      Hotkeys select the active part while editing. Defaults: Tenor T · Lead L · Bari R · Bass B
      (Y/S reserved for Lyrics lane / Stop). Custom parts: pick any free letter.
    </p>

    <ul class="list" role="list">
      <li v-for="part in parts" :key="part.id" class="row">
        <input
          class="name"
          type="text"
          :value="part.name"
          :aria-label="`Name for ${part.name}`"
          :title="tagRollTip(`Rename ${part.name}`)"
          @change="
            store.updatePart(part.id, {
              name: ($event.target as HTMLInputElement).value.trim() || part.name,
            })
          "
        />
        <input
          class="color"
          type="color"
          :value="part.color"
          :aria-label="`Color for ${part.name}`"
          :title="tagRollTip(`Color for ${part.name}`)"
          @input="store.updatePart(part.id, { color: ($event.target as HTMLInputElement).value })"
        />
        <label class="hk" :title="tagRollTip(`Hotkey for ${part.name}`, displayHotkeyForPart(part))">
          <span class="hk-lbl">Key</span>
          <input
            class="hk-in"
            type="text"
            maxlength="1"
            :value="part.hotkey ?? ''"
            :aria-label="`Hotkey for ${part.name}`"
            :placeholder="displayHotkeyForPart(part)?.toLowerCase() ?? '—'"
            @change="onHotkeyChange(part.id, ($event.target as HTMLInputElement).value)"
          />
        </label>
        <button
          type="button"
          class="btn danger sm"
          :disabled="!canDelete"
          :aria-label="`Delete ${part.name}`"
          :title="tagRollTip(`Delete ${part.name} and its notes`)"
          @click="onDelete(part.id, part.name)"
        >
          Delete
        </button>
      </li>
    </ul>

    <div class="add" role="group" aria-label="Add part">
      <input
        v-model="newName"
        class="name"
        type="text"
        aria-label="New part name"
        :title="tagRollTip('New part name')"
        placeholder="Name"
      />
      <input
        v-model="newColor"
        class="color"
        type="color"
        aria-label="New part color"
        :title="tagRollTip('New part color')"
      />
      <input
        v-model="newHotkey"
        class="hk-in"
        type="text"
        maxlength="1"
        aria-label="New part hotkey"
        placeholder="Key"
        :title="
          tagRollTip(
            `Hotkey letter — reserved: ${[...TAG_ROLL_RESERVED_HOTKEYS].filter((k) => /^[a-z]$/.test(k)).join(' ')}`,
          )
        "
      />
      <button type="button" class="btn primary" :title="tagRollTip('Add part')" @click="onAdd">
        Add part
      </button>
    </div>

    <ConfirmDialog
      :open="!!pendingDelete"
      title="Delete part?"
      :message="pendingDeleteMessage"
      confirm-label="Delete"
      @close="cancelPendingDelete"
      @confirm="confirmPendingDelete"
    />
  </div>
</template>

<style scoped>
.tr-parts {
  position: fixed;
  top: 4.5rem;
  right: 0.75rem;
  bottom: 4.75rem;
  z-index: 45;
  width: min(22rem, calc(100vw - 1.5rem));
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  gap: 0.55rem;
  padding: 0.75rem 0.85rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: 12px 0 0 12px;
  background: var(--surface);
  box-shadow: -8px 0 28px color-mix(in srgb, #000 14%, transparent);
  color: var(--text);
  overflow: auto;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.title {
  margin: 0;
  font-size: 1.05rem;
}
.hint {
  margin: 0;
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.35;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
  align-content: start;
  overflow: auto;
  min-height: 0;
}
.row,
.add {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
.name {
  flex: 1 1 8rem;
  min-height: 34px;
  padding: 0.25rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg, var(--surface));
  color: var(--text);
  font: inherit;
}
.color {
  width: 2.4rem;
  height: 2.1rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
}
.hk {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.hk-lbl {
  font-size: 0.68rem;
  font-weight: 650;
  color: var(--muted);
  text-transform: uppercase;
}
.hk-in {
  width: 2.4rem;
  min-height: 34px;
  text-align: center;
  text-transform: uppercase;
  padding: 0.15rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg, var(--surface));
  color: var(--text);
  font: inherit;
  font-weight: 700;
}
.btn {
  min-height: 34px;
  padding: 0.25rem 0.55rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.btn.sm {
  min-height: 32px;
  font-size: 0.85rem;
}
.btn.primary {
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
.btn.danger {
  color: #b91c1c;
}
.btn.ghost {
  background: transparent;
}
.btn:disabled {
  opacity: 0.45;
}
</style>
