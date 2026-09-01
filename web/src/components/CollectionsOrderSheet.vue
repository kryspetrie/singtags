<script setup lang="ts">
/**
 * Reorder user collections (Favorites bar / pickers use this order).
 */
import { computed, ref, watch } from 'vue'
import FilterSheet from './FilterSheet.vue'
import CustomCollectionMark from './CustomCollectionMark.vue'
import { useUserCollectionsStore, type UserCollection } from '../stores/userCollections'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useUserCollectionsStore()
const draft = ref<UserCollection[]>([])

watch(
  () => props.open,
  (open) => {
    if (!open) return
    draft.value = store.collections.map((c) => ({
      ...c,
      tagIds: [...c.tagIds],
    }))
  },
)

const canSave = computed(() => {
  if (draft.value.length !== store.collections.length) return true
  return draft.value.some((c, i) => c.id !== store.collections[i]?.id)
})

function move(id: string, delta: number): void {
  const from = draft.value.findIndex((c) => c.id === id)
  if (from < 0) return
  const to = Math.max(0, Math.min(draft.value.length - 1, from + delta))
  if (to === from) return
  const next = [...draft.value]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  draft.value = next
}

function save(): void {
  store.setOrder(draft.value.map((c) => c.id))
  emit('close')
}
</script>

<template>
  <FilterSheet :open="open" title="Reorder collections" @close="emit('close')">
    <p class="hint">
      Collections at the top appear first in Favorites and pickers — handy for sets you use often.
    </p>

    <ul v-if="draft.length" class="list" aria-label="Collection order">
      <li v-for="(c, index) in draft" :key="c.id" class="row">
        <span class="name"><CustomCollectionMark /> {{ c.name }}</span>
        <div class="moves" role="group" :aria-label="`Reorder ${c.name}`">
          <button
            type="button"
            class="btn"
            :disabled="index === 0"
            :aria-label="`Move ${c.name} up`"
            @click="move(c.id, -1)"
          >
            ↑
          </button>
          <button
            type="button"
            class="btn"
            :disabled="index >= draft.length - 1"
            :aria-label="`Move ${c.name} down`"
            @click="move(c.id, 1)"
          >
            ↓
          </button>
        </div>
      </li>
    </ul>
    <p v-else class="empty">No collections yet.</p>

    <div class="actions">
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button type="button" class="btn btn-primary" :disabled="!canSave || !draft.length" @click="save">
        Save order
      </button>
    </div>
  </FilterSheet>
</template>

<style scoped>
.hint,
.empty {
  margin: 0 0 0.85rem;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
}
.list {
  list-style: none;
  margin: 0 0 1rem;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  min-height: 44px;
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
}
.name {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.moves {
  display: inline-flex;
  gap: 0.35rem;
  flex-shrink: 0;
}
.moves .btn {
  min-width: 44px;
  min-height: 44px;
  padding: 0;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  justify-content: flex-end;
}
</style>
