<script setup lang="ts">
/**
 * Bottom sheet to add selected Local Library songs to a group (or create one).
 */
import { computed, ref, watch } from 'vue'
import FilterSheet from './FilterSheet.vue'
import { useLocalLibraryStore } from '../stores/localLibrary'

const props = defineProps<{
  open: boolean
  entryIds: string[]
  title?: string
}>()

const emit = defineEmits<{
  close: []
  done: [groupId: string, groupName: string]
}>()

const library = useLocalLibraryStore()
const newName = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

const sorted = computed(() => library.groups)

const countLabel = computed(() => {
  const n = props.entryIds.length
  return `${n} song${n === 1 ? '' : 's'}`
})

watch(
  () => props.open,
  (open) => {
    if (open) {
      newName.value = ''
      error.value = null
      busy.value = false
    }
  },
)

watch(newName, () => {
  if (error.value) error.value = null
})

async function addTo(id: string): Promise<void> {
  if (busy.value) return
  error.value = null
  const group = library.groups.find((g) => g.id === id)
  if (!group) {
    error.value = 'Group not found'
    return
  }
  busy.value = true
  try {
    await library.addEntriesToGroup(id, props.entryIds)
    emit('done', id, group.name)
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not add to group'
  } finally {
    busy.value = false
  }
}

async function createAndAdd(): Promise<void> {
  if (busy.value) return
  error.value = null
  busy.value = true
  try {
    const group = await library.createGroup(newName.value)
    if (!group) {
      error.value = 'Enter a group name'
      return
    }
    await library.addEntriesToGroup(group.id, props.entryIds)
    emit('done', group.id, group.name)
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not create group'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <FilterSheet :open="open" :title="title || 'Add to group'" @close="emit('close')">
    <p class="hint">Choose a group for {{ countLabel }}, or create a new one.</p>

    <ul v-if="sorted.length" class="list" aria-label="Your groups">
      <li v-for="g in sorted" :key="g.id">
        <button type="button" class="pick" :disabled="busy" @click="addTo(g.id)">
          <span class="name">{{ g.name }}</span>
          <span class="meta">{{ g.entryIds.length }}</span>
        </button>
      </li>
    </ul>
    <p v-else class="empty">No groups yet.</p>

    <div class="create">
      <label class="field">
        <span class="lbl">New group</span>
        <input
          v-model="newName"
          type="text"
          maxlength="80"
          placeholder="e.g. Contest set"
          aria-label="New group name"
          :aria-invalid="!!error"
          aria-describedby="local-group-create-error"
          @keydown.enter.prevent="createAndAdd"
        />
        <p id="local-group-create-error" class="field-error" role="alert" aria-live="polite">
          {{ error }}
        </p>
      </label>
      <button
        type="button"
        class="btn btn-primary create-btn"
        :disabled="busy || !newName.trim()"
        @click="createAndAdd"
      >
        Create &amp; add
      </button>
    </div>
  </FilterSheet>
</template>

<style scoped>
.hint {
  margin: 0 0 0.85rem;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
}
.empty {
  margin: 0 0 0.85rem;
  color: var(--muted);
  font-size: 0.92rem;
}
.field-error {
  margin: 0;
  min-height: calc(1.35rem * 2 + 0.15rem);
  font-size: 0.85rem;
  line-height: 1.35;
  color: var(--danger, #9b2c2c);
}
.list {
  list-style: none;
  margin: 0 0 1rem;
  padding: 0;
  display: grid;
  gap: 0.4rem;
  max-height: min(40vh, 14rem);
  overflow: auto;
}
.pick {
  display: flex;
  width: 100%;
  box-sizing: border-box;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 44px;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg, var(--surface, #fff));
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.pick:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
.pick:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.name {
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  color: var(--muted);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.create {
  display: grid;
  gap: 0.55rem;
  padding-top: 0.85rem;
  margin-top: 0.15rem;
  border-top: 1px solid var(--border);
}
.field {
  display: grid;
  gap: 0.3rem;
}
.lbl {
  font-size: 0.85rem;
  font-weight: 600;
}
.field input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg, var(--surface, #fff));
  color: var(--text);
  font: inherit;
  font-size: 16px;
}
.create-btn {
  width: 100%;
  min-height: 44px;
}
.create-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
