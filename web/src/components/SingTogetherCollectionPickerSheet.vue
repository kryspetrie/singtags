<script setup lang="ts">
/**
 * Bottom sheet to add repertoire songs to a collection or create one.
 */
import { computed, ref, watch } from 'vue'
import FilterSheet from './FilterSheet.vue'
import CustomCollectionMark from './CustomCollectionMark.vue'
import { useSingTogetherStore } from '../stores/singTogether'

const props = defineProps<{
  open: boolean
  songIds: string[]
  title?: string
}>()

const emit = defineEmits<{
  close: []
  done: [collectionId: string, collectionName: string]
}>()

const store = useSingTogetherStore()
const newName = ref('')
const error = ref<string | null>(null)

const sorted = computed(() => store.collections)

const songCountLabel = computed(() => {
  const n = props.songIds.length
  return `${n} song${n === 1 ? '' : 's'}`
})

watch(
  () => props.open,
  (open) => {
    if (open) {
      newName.value = ''
      error.value = null
    }
  },
)

watch(newName, () => {
  if (error.value) error.value = null
})

function addTo(id: string): void {
  error.value = null
  const col = store.collectionById(id)
  if (!col) {
    error.value = 'Collection not found'
    return
  }
  store.addSongsToCollection(id, props.songIds)
  emit('done', id, col.name)
  emit('close')
}

function createAndAdd(): void {
  error.value = null
  const nameError = store.validateCollectionName(newName.value)
  if (nameError) {
    error.value = nameError
    return
  }
  const col = store.createCollection(newName.value, props.songIds)
  if (!col) {
    error.value = 'Could not create collection'
    return
  }
  emit('done', col.id, col.name)
  emit('close')
}
</script>

<template>
  <FilterSheet
    :open="open"
    :title="title || 'Add to collection'"
    @close="emit('close')"
  >
    <p class="hint">
      Choose a collection for {{ songCountLabel }}, or create a new one.
    </p>

    <ul v-if="sorted.length" class="list" aria-label="Your collections">
      <li v-for="c in sorted" :key="c.id">
        <button type="button" class="pick" @click="addTo(c.id)">
          <span class="name"><CustomCollectionMark /> {{ c.name }}</span>
          <span class="meta">{{ c.songIds.length }}</span>
        </button>
      </li>
    </ul>
    <p v-else class="empty">No collections yet.</p>

    <div class="create">
      <label class="field">
        <span class="lbl">New collection</span>
        <input
          v-model="newName"
          type="text"
          maxlength="80"
          placeholder="e.g. Contest set"
          aria-label="New collection name"
          :aria-invalid="!!error"
          aria-describedby="st-collection-create-error"
          @keydown.enter.prevent="createAndAdd"
        />
        <p id="st-collection-create-error" class="field-error" role="alert" aria-live="polite">
          {{ error }}
        </p>
      </label>
      <button
        type="button"
        class="btn btn-primary create-btn"
        :disabled="!newName.trim()"
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
  gap: 0.35rem;
}
.pick {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 44px;
  padding: 0.45rem 0.65rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  text-align: left;
  cursor: pointer;
  color: inherit;
}
.pick:hover {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}
.name {
  font-weight: 650;
  min-width: 0;
}
.meta {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  font-size: 0.88rem;
}
.create {
  display: grid;
  gap: 0.65rem;
}
.field {
  display: grid;
  gap: 0.3rem;
}
.lbl {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--muted);
}
.field input {
  font: inherit;
  min-height: 44px;
  padding: 0.45rem 0.65rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: inherit;
}
.create-btn {
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  color: inherit;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}
.create-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
