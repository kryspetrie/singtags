<script setup lang="ts">
/**
 * Add / rename / recolor / delete Tag Roll parts.
 */
import { computed, ref } from 'vue'
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

const project = computed(() => store.current)
const parts = computed(() => project.value?.parts ?? [])
const canDelete = computed(() => parts.value.length > 1)

function onAdd(): void {
  store.addPart(newName.value, newColor.value)
  newName.value = 'Part'
}

function onDelete(id: string, name: string): void {
  if (!canDelete.value) return
  if (!confirm(`Delete part “${name}” and its notes?`)) return
  store.removePart(id)
}
</script>

<template>
  <div v-if="open && project" class="tr-parts" role="dialog" aria-label="Parts">
    <header class="head">
      <h2 class="title">Parts</h2>
      <button type="button" class="btn ghost" aria-label="Close" @click="emit('close')">✕</button>
    </header>

    <ul class="list" role="list">
      <li v-for="part in parts" :key="part.id" class="row">
        <input
          class="name"
          type="text"
          :value="part.name"
          :aria-label="`Name for ${part.name}`"
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
          @input="store.updatePart(part.id, { color: ($event.target as HTMLInputElement).value })"
        />
        <button
          type="button"
          class="btn danger sm"
          :disabled="!canDelete"
          :aria-label="`Delete ${part.name}`"
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
        placeholder="Name"
      />
      <input v-model="newColor" class="color" type="color" aria-label="New part color" />
      <button type="button" class="btn primary" @click="onAdd">Add part</button>
    </div>
  </div>
</template>

<style scoped>
.tr-parts {
  display: grid;
  gap: 0.55rem;
  padding: 0.65rem 0.75rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  max-width: 26rem;
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
  font-weight: 700;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
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
  min-height: 36px;
  min-width: 6rem;
  padding: 0.25rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg, var(--surface));
  color: var(--text);
  font: inherit;
}
.color {
  width: 2.4rem;
  height: 36px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
}
.btn {
  min-height: 36px;
  padding: 0.25rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 650;
  font-size: 0.88rem;
  cursor: pointer;
}
.btn.sm {
  min-height: 34px;
  padding: 0.2rem 0.5rem;
}
.btn.ghost {
  border-color: transparent;
  background: transparent;
  color: var(--muted);
}
.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent, #fff);
}
.btn.danger {
  color: var(--danger, #b42318);
  border-color: color-mix(in srgb, var(--danger, #b42318) 35%, var(--border));
}
.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
