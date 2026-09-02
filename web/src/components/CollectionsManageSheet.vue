<script setup lang="ts">
/**
 * Manage user collections: reorder, rename, delete, and create.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import FilterSheet from './FilterSheet.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import CustomCollectionMark from './CustomCollectionMark.vue'
import TransferButtonLabel from './TransferButtonLabel.vue'
import { useSortableListDrag } from '../composables/useSortableListDrag'
import { useUserCollectionsStore } from '../stores/userCollections'
import { usePreferencesStore } from '../stores/preferences'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  created: [id: string]
  deleted: [id: string]
}>()

const store = useUserCollectionsStore()
const prefs = usePreferencesStore()
const router = useRouter()

const showOpticalTransfer = computed(
  () => prefs.opticalTransferEnabled && prefs.opticalTransferListButtons,
)

const { dragActive, onHandlePointerDown, onDragEnter, rowDragClass, listDraggingClass } =
  useSortableListDrag<string>({
    rowSelector: 'li.manage-row',
    onReorder: (id, toIndex) => {
      store.moveCollection(id, toIndex)
    },
  })
const createOpen = ref(false)
const createInput = ref('')
const createError = ref<string | null>(null)
const createInputRef = ref<HTMLInputElement | null>(null)
const pendingDeleteId = ref<string | null>(null)
const pendingRenameId = ref<string | null>(null)
const renameInput = ref('')
const renameError = ref<string | null>(null)
const renameInputRef = ref<HTMLInputElement | null>(null)

const pendingDeleteMessage = computed(() => {
  const col = pendingDeleteId.value ? store.byId(pendingDeleteId.value) : null
  if (!col) return ''
  return `Delete “${col.name}”? Favorites stay favorited — only this collection is removed.`
})

const pendingRenameTitle = computed(() => {
  const col = pendingRenameId.value ? store.byId(pendingRenameId.value) : null
  return col ? `Rename “${col.name}”` : 'Rename collection'
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    createOpen.value = false
    createInput.value = ''
    createError.value = null
    pendingDeleteId.value = null
    pendingRenameId.value = null
    renameInput.value = ''
    renameError.value = null
  },
)

watch(createOpen, async (open) => {
  if (!open) return
  createInput.value = ''
  createError.value = null
  await nextTick()
  createInputRef.value?.focus()
})

watch(pendingRenameId, async (id) => {
  if (!id) return
  const col = store.byId(id)
  renameInput.value = col?.name ?? ''
  renameError.value = null
  await nextTick()
  renameInputRef.value?.focus()
  renameInputRef.value?.select()
})

function formatCollectionDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function openCreateDialog(): void {
  createOpen.value = true
}

function cancelCreateDialog(): void {
  createOpen.value = false
  createInput.value = ''
  createError.value = null
}

function confirmCreateDialog(): void {
  createError.value = null
  const nameError = store.validateName(createInput.value)
  if (nameError) {
    createError.value = nameError
    return
  }
  const col = store.create(createInput.value)
  if (!col) {
    createError.value = 'Could not create collection'
    return
  }
  cancelCreateDialog()
  emit('created', col.id)
}

function openRenameDialog(id: string): void {
  if (!store.byId(id)) return
  pendingRenameId.value = id
}

function cancelRenameDialog(): void {
  pendingRenameId.value = null
  renameInput.value = ''
  renameError.value = null
}

function confirmRenameDialog(): void {
  const id = pendingRenameId.value
  if (!id) return
  renameError.value = null
  const nameError = store.validateName(renameInput.value, id)
  if (nameError) {
    renameError.value = nameError
    return
  }
  if (!store.rename(id, renameInput.value)) {
    renameError.value = 'Could not rename collection'
    return
  }
  cancelRenameDialog()
}

function requestDeleteCollection(id: string): void {
  if (!store.byId(id)) return
  pendingDeleteId.value = id
}

function cancelDeleteCollection(): void {
  pendingDeleteId.value = null
}

function confirmDeleteCollection(): void {
  const id = pendingDeleteId.value
  if (!id) return
  pendingDeleteId.value = null
  const col = store.byId(id)
  if (!col) return
  store.remove(id)
  emit('deleted', id)
}

function transferCollectionOptically(id: string): void {
  const col = store.byId(id)
  if (!col?.tagIds.length) return
  emit('close')
  void router.push({ name: 'tx', query: { collection: id } })
}
</script>

<template>
  <FilterSheet :open="open" title="Manage collections" full-screen elevated @close="emit('close')">
    <div class="manage">
      <p class="manage-desc">
        Collections group favorites on this device. Drag the ⠿ handle to reorder — collections at
        the top appear first here and in pickers. Unfavoriting a tag removes it from every
        collection.
      </p>
      <ul
        v-if="store.collections.length"
        class="manage-list sortable-list"
        :class="listDraggingClass"
        aria-label="Your collections"
      >
        <li
          v-for="(c, index) in store.collections"
          :key="c.id"
          class="manage-row sortable-row"
          :data-index="index"
          :class="{ 'no-edit': dragActive, ...rowDragClass(c.id, index) }"
          @pointerenter="onDragEnter($event, index)"
        >
          <button
            type="button"
            class="drag-handle"
            :aria-label="`Drag ${c.name} to reorder`"
            aria-roledescription="sortable"
            @pointerdown="onHandlePointerDown($event, c.id, index)"
          >
            ⠿
          </button>
          <div class="manage-main">
            <div class="manage-title-row">
              <span class="manage-name"><CustomCollectionMark /> {{ c.name }}</span>
              <span class="manage-count">
                {{ c.tagIds.length }} tag{{ c.tagIds.length === 1 ? '' : 's' }}
              </span>
            </div>
            <span class="manage-dates">
              Created {{ formatCollectionDate(c.createdAt) }} · Updated
              {{ formatCollectionDate(c.updatedAt) }}
            </span>
          </div>
          <div class="manage-row-actions">
            <button
              v-if="showOpticalTransfer"
              type="button"
              class="manage-btn"
              aria-label="Transfer optically"
              :disabled="!c.tagIds.length"
              @click="transferCollectionOptically(c.id)"
            >
              <TransferButtonLabel />
            </button>
            <button type="button" class="manage-btn" @click="openRenameDialog(c.id)">Rename</button>
            <button type="button" class="manage-btn manage-btn-danger" @click="requestDeleteCollection(c.id)">
              Delete
            </button>
          </div>
        </li>
      </ul>
      <p v-else class="manage-empty">No collections yet.</p>

      <div class="manage-footer">
        <button type="button" class="manage-btn manage-btn-primary" @click="openCreateDialog">
          New collection
        </button>
      </div>
    </div>
  </FilterSheet>

  <ConfirmDialog
    :open="createOpen"
    title="New collection"
    message="Choose a name for this collection."
    confirm-label="Create"
    :danger="false"
    @close="cancelCreateDialog"
    @confirm="confirmCreateDialog"
  >
    <label class="name-field">
      <span class="name-lbl">Name</span>
      <input
        ref="createInputRef"
        v-model="createInput"
        type="text"
        maxlength="80"
        placeholder="e.g. Contest set"
        aria-label="New collection name"
        @keydown.enter.prevent="confirmCreateDialog"
      />
    </label>
    <p v-if="createError" class="name-err" role="alert">{{ createError }}</p>
  </ConfirmDialog>

  <ConfirmDialog
    :open="!!pendingRenameId"
    :title="pendingRenameTitle"
    message="Choose a new name for this collection."
    confirm-label="Rename"
    :danger="false"
    @close="cancelRenameDialog"
    @confirm="confirmRenameDialog"
  >
    <label class="name-field">
      <span class="name-lbl">Name</span>
      <input
        ref="renameInputRef"
        v-model="renameInput"
        type="text"
        maxlength="80"
        aria-label="Collection name"
        @keydown.enter.prevent="confirmRenameDialog"
      />
    </label>
    <p v-if="renameError" class="name-err" role="alert">{{ renameError }}</p>
  </ConfirmDialog>

  <ConfirmDialog
    :open="!!pendingDeleteId"
    title="Delete collection?"
    :message="pendingDeleteMessage"
    confirm-label="Delete"
    @close="cancelDeleteCollection"
    @confirm="confirmDeleteCollection"
  />
</template>

<style scoped>
.manage {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  min-height: 0;
}
.manage-desc {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
}
.manage-empty {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
}
.name-err {
  margin: 0;
  color: var(--danger, #9b2c2c);
  font-size: 0.9rem;
}
.manage-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
  flex: 1;
  min-height: 0;
  overflow: auto;
  align-content: start;
}
.sortable-list.list-dragging {
  user-select: none;
  cursor: grabbing;
}
.sortable-list.list-dragging .sortable-row:not(.dragging) {
  opacity: 0.55;
}
.manage-row {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.45rem;
  align-items: center;
  padding: 0.45rem 0.55rem 0.45rem 0.25rem;
  border: 1px solid var(--border);
  border-radius: var(--radius, 10px);
  background: var(--surface);
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease,
    opacity 0.12s ease,
    border-color 0.12s ease,
    background 0.12s ease;
}
.manage-row.no-edit .manage-row-actions {
  pointer-events: none;
}
.sortable-row.dragging {
  z-index: 3;
  opacity: 1;
  transform: scale(1.02) translateY(-2px);
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  box-shadow: 0 10px 28px color-mix(in srgb, var(--text) 18%, transparent);
}
.sortable-row.dragging .drag-handle {
  color: var(--accent);
  cursor: grabbing;
}
.sortable-row.drop-before::before,
.sortable-row.drop-after::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
  pointer-events: none;
  z-index: 4;
}
.sortable-row.drop-before::before {
  top: -0.28rem;
}
.sortable-row.drop-after::after {
  bottom: -0.28rem;
}
.drag-handle {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  min-height: 40px;
  width: 36px;
  padding: 0;
  margin: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 1.05rem;
  line-height: 1;
  cursor: grab;
  touch-action: none;
}
.drag-handle:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--text) 6%, transparent);
}
.drag-handle:active {
  cursor: grabbing;
}
.manage-main {
  display: grid;
  gap: 0.08rem;
  min-width: 0;
}
.manage-title-row {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
  min-width: 0;
}
.manage-name {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.92rem;
  font-weight: 650;
}
.manage-count {
  flex-shrink: 0;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.manage-dates {
  color: var(--muted);
  font-size: 0.72rem;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.manage-row-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.3rem;
  flex-shrink: 0;
}
.name-field {
  display: grid;
  gap: 0.3rem;
}
.name-field input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 16px;
}
.name-lbl {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--muted);
}
.manage-btn {
  min-height: 36px;
  padding: 0.28rem 0.6rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
}
.manage-btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
.manage-btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.manage-btn-primary:hover:not(:disabled) {
  border-color: var(--accent);
  filter: brightness(1.05);
}
.manage-btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  filter: none;
}
.manage-btn-danger {
  color: var(--danger, #9b2c2c);
}
.manage-btn-danger:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--danger, #9b2c2c) 45%, var(--border));
  background: color-mix(in srgb, var(--danger, #9b2c2c) 8%, var(--surface));
}
.manage-footer {
  display: flex;
  justify-content: flex-start;
  padding-top: 0.85rem;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
</style>
