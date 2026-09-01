<script setup lang="ts">
/**
 * Bottom sheet to add one or more tags to an existing user collection or create a new one.
 */
import { computed, ref, watch } from 'vue'
import FilterSheet from './FilterSheet.vue'
import CustomCollectionMark from './CustomCollectionMark.vue'
import { useUserCollectionsStore } from '../stores/userCollections'

const props = defineProps<{
  /** Sheet visibility. */
  open: boolean
  /** Tag ids to add once a collection is chosen or created. */
  tagIds: number[]
  title?: string
}>()

const emit = defineEmits<{
  close: []
  /** Fired after tags are added to an existing or newly created collection. */
  done: [collectionId: string, collectionName: string]
}>()

const collections = useUserCollectionsStore()
const newName = ref('')
const error = ref<string | null>(null)

const sorted = computed(() => collections.collections)

const tagCountLabel = computed(() => {
  const n = props.tagIds.length
  return `${n} tag${n === 1 ? '' : 's'}`
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
  const col = collections.byId(id)
  if (!col) {
    error.value = 'Collection not found'
    return
  }
  collections.addTags(id, props.tagIds)
  emit('done', id, col.name)
  emit('close')
}

function createAndAdd(): void {
  error.value = null
  const nameError = collections.validateName(newName.value)
  if (nameError) {
    error.value = nameError
    return
  }
  const col = collections.create(newName.value, props.tagIds)
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
      Choose a collection for {{ tagCountLabel }}, or create a new one.
    </p>

    <ul v-if="sorted.length" class="list" aria-label="Your collections">
      <li v-for="c in sorted" :key="c.id">
        <button type="button" class="pick" @click="addTo(c.id)">
          <span class="name"><CustomCollectionMark /> {{ c.name }}</span>
          <span class="meta">{{ c.tagIds.length }}</span>
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
          aria-describedby="collection-create-error"
          @keydown.enter.prevent="createAndAdd"
        />
        <p id="collection-create-error" class="field-error" role="alert" aria-live="polite">
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
.pick:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
.name {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;

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
