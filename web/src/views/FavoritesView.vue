<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import EmptyState from '../components/EmptyState.vue'
import FilterSheet from '../components/FilterSheet.vue'
import StarsNoticeLine from '../components/StarsNoticeLine.vue'
import CollectionPickerSheet from '../components/CollectionPickerSheet.vue'
import CustomCollectionMark from '../components/CustomCollectionMark.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { useStarsStore } from '../stores/stars'
import { usePracticeStore } from '../stores/practice'
import { useUserCollectionsStore } from '../stores/userCollections'
import { buildFavoritesBackup, parseFavoritesBackup } from '../lib/favoritesBackup'
import { downloadBlob } from '../download/zip'
import { useOnline } from '../composables/useOnline'
import {
  STARRED_SORT_OPTIONS,
  type StarredSortMode,
  sortStarredRecords,
} from '../lib/starredSort'

const stars = useStarsStore()
const practice = usePracticeStore()
const userCollections = useUserCollectionsStore()
const { offline } = useOnline()
const fileInput = ref<HTMLInputElement | null>(null)
const fetchMediaOnImport = ref(false)
const backupOpen = ref(false)
const manageOpen = ref(false)
const addOpen = ref(false)
const activeCollectionId = ref<string | null>(null)
const pendingUnfavorite = ref<{ tagId: number; title: string } | null>(null)
const renameDraft = ref<Record<string, string>>({})
const newCollectionName = ref('')
const manageError = ref<string | null>(null)
const sortMode = ref<StarredSortMode>('custom')
const sortOptions = STARRED_SORT_OPTIONS

const DRAG_HOLD_MS = 280

const draggingId = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
const dragOverEdge = ref<'before' | 'after' | null>(null)
const dragFromIndex = ref(-1)
const dragActive = ref(false)
let holdTimer: ReturnType<typeof setTimeout> | null = null
let holdPointerId: number | null = null
let holdStartY = 0

const orderedRecords = computed(() => {
  const byId = new Map(stars.records.map((r) => [r.tagId, r]))
  const colId = activeCollectionId.value
  if (colId) {
    const colIds = userCollections.byId(colId)?.tagIds ?? []
    const members = colIds.map((id) => byId.get(id)).filter(Boolean)
    if (sortMode.value === 'custom') return members
    return sortStarredRecords(
      members as NonNullable<(typeof members)[number]>[],
      sortMode.value,
    )
  }
  if (sortMode.value === 'custom') {
    return practice.order.map((id) => byId.get(id)).filter(Boolean)
  }
  return sortStarredRecords(stars.records, sortMode.value)
})

const collectionChips = computed(() =>
  [...userCollections.collections].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  ),
)

const activeCollection = computed(() =>
  activeCollectionId.value ? userCollections.byId(activeCollectionId.value) : null,
)

const addPickerTagIds = computed(() => orderedRecords.value.map((r) => r!.tagId))

const canApplySort = computed(() => stars.count > 0 && sortMode.value !== 'custom')

watch(
  () => stars.records.map((r) => r.tagId),
  (ids) => userCollections.pruneToStarred(ids),
)

watch(manageOpen, (open) => {
  if (!open) return
  manageError.value = null
  newCollectionName.value = ''
  const drafts: Record<string, string> = {}
  for (const c of userCollections.collections) drafts[c.id] = c.name
  renameDraft.value = drafts
})

const finePointer = computed(() =>
  typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches,
)

onMounted(async () => {
  await stars.ensureLoaded()
  practice.syncFromStarred(stars.records.map((r) => r.tagId))
})

onUnmounted(() => {
  clearHoldTimer()
  stopDragListeners()
})

watch(
  () => stars.records.map((r) => r.tagId).join(','),
  () => {
    practice.syncFromStarred(stars.records.map((r) => r.tagId))
  },
)

function clearHoldTimer(): void {
  if (holdTimer) {
    clearTimeout(holdTimer)
    holdTimer = null
  }
}

function stopDragListeners(): void {
  window.removeEventListener('pointermove', onHoldMove)
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
}

function beginDrag(tagId: number, index: number, pointerId: number, handle: HTMLElement): void {
  dragActive.value = true
  draggingId.value = tagId
  dragFromIndex.value = index
  dragOverIndex.value = index
  dragOverEdge.value = null
  handle.setPointerCapture(pointerId)
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
}

function onHandlePointerDown(e: PointerEvent, tagId: number, index: number): void {
  if (dragActive.value) return
  const handle = e.currentTarget as HTMLElement
  holdPointerId = e.pointerId
  holdStartY = e.clientY

  const start = (): void => {
    clearHoldTimer()
    window.removeEventListener('pointermove', onHoldMove)
    window.removeEventListener('pointerup', cancelHold)
    window.removeEventListener('pointercancel', cancelHold)
    if (holdPointerId !== e.pointerId) return
    beginDrag(tagId, index, e.pointerId, handle)
  }

  if (finePointer.value) {
    e.preventDefault()
    start()
    return
  }

  window.addEventListener('pointermove', onHoldMove)
  window.addEventListener('pointerup', cancelHold)
  window.addEventListener('pointercancel', cancelHold)
  holdTimer = setTimeout(start, DRAG_HOLD_MS)
}

function onHoldMove(e: PointerEvent): void {
  if (holdPointerId !== e.pointerId) return
  if (Math.abs(e.clientY - holdStartY) > 8) cancelHold()
}

function cancelHold(): void {
  clearHoldTimer()
  holdPointerId = null
  window.removeEventListener('pointermove', onHoldMove)
  window.removeEventListener('pointerup', cancelHold)
  window.removeEventListener('pointercancel', cancelHold)
}

function setDropTarget(row: HTMLElement, clientY: number): void {
  const index = Number(row.dataset.index)
  if (!Number.isFinite(index)) return
  if (index === dragFromIndex.value) {
    dragOverIndex.value = index
    dragOverEdge.value = null
    return
  }
  const rect = row.getBoundingClientRect()
  const edge: 'before' | 'after' = clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  dragOverIndex.value = index
  dragOverEdge.value = edge
}

function insertIndexForDrop(): number | null {
  const over = dragOverIndex.value
  const edge = dragOverEdge.value
  const from = dragFromIndex.value
  if (over == null || edge == null || from < 0) return null
  let insertAt = edge === 'after' ? over + 1 : over
  if (from < insertAt) insertAt--
  return insertAt
}

function onDragMove(e: PointerEvent): void {
  if (!dragActive.value) return
  const el = document.elementFromPoint(e.clientX, e.clientY)
  const row = el?.closest<HTMLElement>('li.favorites-row')
  if (!row) return
  setDropTarget(row, e.clientY)
}

function onDragEnter(e: PointerEvent, index: number): void {
  if (!dragActive.value) return
  const row = e.currentTarget as HTMLElement
  if (Number(row.dataset.index) !== index) return
  setDropTarget(row, e.clientY)
}

function onDragEnd(): void {
  clearHoldTimer()
  window.removeEventListener('pointermove', onHoldMove)
  if (dragActive.value && draggingId.value != null) {
    const toIndex = insertIndexForDrop()
    if (toIndex != null) {
      const colId = activeCollectionId.value
      const ids = orderedRecords.value.map((r) => r!.tagId)
      // Dragging adopts the current view as custom order, then reorders.
      if (sortMode.value !== 'custom') {
        if (colId) userCollections.setTagOrder(colId, ids)
        else practice.resetFromStarred(ids)
        sortMode.value = 'custom'
      }
      if (colId) userCollections.reorderTag(colId, draggingId.value, toIndex)
      else practice.reorder(draggingId.value, toIndex)
    }
  }
  dragActive.value = false
  draggingId.value = null
  dragFromIndex.value = -1
  dragOverIndex.value = null
  dragOverEdge.value = null
  holdPointerId = null
  stopDragListeners()
}

function downloadStarredFile(): void {
  const data = buildFavoritesBackup({
    records: stars.records,
    collections: userCollections.exportSnapshot(),
    practice: practice.exportSnapshot(),
  })
  const bytes = new TextEncoder().encode(JSON.stringify(data, null, 2))
  downloadBlob(bytes, 'favorites.tags', 'application/json')
}

async function onImportFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const backup = parseFavoritesBackup(JSON.parse(text))
    await stars.importFromJson(backup.starred, fetchMediaOnImport.value && !offline.value)
    userCollections.replaceAll(backup.collections)
    practice.importSnapshot(backup.practice)
    backupOpen.value = false
  } catch (err) {
    stars.error = err instanceof Error ? err.message : String(err)
  } finally {
    input.value = ''
  }
}

function applySort(): void {
  if (sortMode.value === 'custom') return
  const ids = orderedRecords.value.map((r) => r!.tagId)
  const colId = activeCollectionId.value
  if (colId) userCollections.setTagOrder(colId, ids)
  else practice.resetFromStarred(ids)
  sortMode.value = 'custom'
}

function selectCollection(id: string | null): void {
  activeCollectionId.value = id
}

function saveRename(id: string): void {
  manageError.value = null
  if (!userCollections.rename(id, renameDraft.value[id] ?? '')) {
    manageError.value = 'Enter a collection name'
  }
}

function deleteCollection(id: string): void {
  manageError.value = null
  const col = userCollections.byId(id)
  if (!col) return
  if (!confirm(`Delete collection “${col.name}”? Favorites stay favorited.`)) return
  userCollections.remove(id)
  if (activeCollectionId.value === id) activeCollectionId.value = null
  const { [id]: _removed, ...rest } = renameDraft.value
  renameDraft.value = rest
}

function createManagedCollection(): void {
  manageError.value = null
  const col = userCollections.create(newCollectionName.value)
  if (!col) {
    manageError.value = 'Enter a collection name'
    return
  }
  renameDraft.value = { ...renameDraft.value, [col.id]: col.name }
  newCollectionName.value = ''
  activeCollectionId.value = col.id
}

function removeFromActiveCollection(tagId: number): void {
  const colId = activeCollectionId.value
  if (!colId) return
  userCollections.removeTags(colId, [tagId])
}

function onAddedToCollection(_id: string, name: string): void {
  stars.lastNotice = { type: 'text', message: `Added to “${name}”` }
}

function requestUnfavorite(tagId: number, title: string): void {
  const inCollections = userCollections.collections.some((c) => c.tagIds.includes(tagId))
  if (activeCollectionId.value || inCollections) {
    pendingUnfavorite.value = { tagId, title }
    return
  }
  void stars.unstar(tagId)
}

async function confirmPendingUnfavorite(): Promise<void> {
  const pending = pendingUnfavorite.value
  pendingUnfavorite.value = null
  if (!pending) return
  await stars.unstar(pending.tagId)
}

function rowStarTip(title: string, tagId: number): string {
  if (stars.isTagCaching(tagId)) {
    return stars.tagCachingLabel(tagId) || 'Saving for offline…'
  }
  if (activeCollectionId.value) {
    return `Unfavorite ${title || `tag #${tagId}`} — removes from favorites and all collections`
  }
  return `Unfavorite ${title || `tag #${tagId}`} — remove from saved tags`
}

function rowStarLabel(title: string, tagId: number): string {
  if (stars.isTagCaching(tagId)) return 'Saving for offline'
  return `Unfavorite ${title || `tag #${tagId}`}`
}
</script>

<template>
  <section class="favorites" aria-label="Favorites">
    <p class="muted intro">
      Offline favorites on this device. Pick a sort to preview, then Apply sort to save it as your
      custom order — or drag the handle to rearrange.
      <RouterLink to="/settings">Offline library settings</RouterLink>
    </p>

    <div class="actions">
      <label class="sort-field">
        <span class="sort-lbl">Sort</span>
        <select v-model="sortMode" aria-label="Sort favorites" :disabled="!stars.count">
          <option v-for="s in sortOptions" :key="s.id" :value="s.id">{{ s.label }}</option>
        </select>
      </label>
      <button
        type="button"
        class="primary"
        :disabled="!canApplySort"
        title="Save the current sort as your custom order"
        @click="applySort"
      >
        Apply sort
      </button>
      <button type="button" @click="backupOpen = true">Backup &amp; restore</button>
      <button type="button" @click="manageOpen = true">Manage collections</button>
    </div>

    <div class="collection-bar" role="toolbar" aria-label="Favorite collections">
      <button
        type="button"
        class="chip"
        :class="{ on: !activeCollectionId }"
        :aria-pressed="!activeCollectionId"
        @click="selectCollection(null)"
      >
        All
      </button>
      <button
        v-for="c in collectionChips"
        :key="c.id"
        type="button"
        class="chip"
        :class="{ on: activeCollectionId === c.id }"
        :aria-pressed="activeCollectionId === c.id"
        @click="selectCollection(c.id)"
      >
        <CustomCollectionMark />
        {{ c.name }}
        <span class="chip-n">{{ c.tagIds.length }}</span>
      </button>
      <button
        type="button"
        class="chip chip-add"
        :disabled="!orderedRecords.length && !stars.count"
        title="Add currently listed favorites to a collection"
        @click="addOpen = true"
      >
        Add listed…
      </button>
    </div>
    <p v-if="activeCollection" class="collection-hint">
      Showing “{{ activeCollection.name }}”
      <button type="button" class="linkish" @click="selectCollection(null)">Show all</button>
    </p>

    <div v-if="stars.progress" class="progress" role="status">
      <div class="bar" :style="{ width: `${Math.round(stars.progress.ratio * 100)}%` }" />
      <span>{{ stars.progress.label }}</span>
    </div>
    <p v-if="stars.lastNotice" class="ok stars-notice-wrap" role="status">
      <StarsNoticeLine :notice="stars.lastNotice" />
    </p>

    <p v-if="!stars.loaded" class="text-muted" role="status">Loading favorites…</p>
    <EmptyState
      v-else-if="!stars.records.length"
      title="No favorites yet"
      message="Favorite from Browse or a tag page to save for quick recall and offline use."
    />
    <EmptyState
      v-else-if="!orderedRecords.length && activeCollection"
      title="Nothing in this collection"
      message="From Browse, select tags and use Add to collection — or pick another collection."
    />

    <ol
      v-else-if="orderedRecords.length"
      class="list"
      :class="{ 'list-dragging': dragActive }"
      aria-label="Favorites"
    >
      <li
        v-for="(r, i) in orderedRecords"
        :key="r!.tagId"
        class="favorites-row"
        :data-index="i"
        :class="{
          dragging: draggingId === r!.tagId,
          'drop-before':
            dragActive &&
            dragOverIndex === i &&
            dragOverEdge === 'before' &&
            draggingId !== r!.tagId,
          'drop-after':
            dragActive &&
            dragOverIndex === i &&
            dragOverEdge === 'after' &&
            draggingId !== r!.tagId,
        }"
        @pointerenter="onDragEnter($event, i)"
      >
        <button
          type="button"
          class="drag-handle"
          :aria-label="`Drag ${r!.summary.title || r!.tagId} to reorder`"
          aria-roledescription="sortable"
          @pointerdown="onHandlePointerDown($event, r!.tagId, i)"
        >
          ⠿
        </button>
        <div
          class="card"
          :class="{ 'no-nav': dragActive }"
        >
          <RouterLink
            :to="`/tag/${r!.tagId}`"
            class="row-link"
            @click="dragActive && $event.preventDefault()"
          >
            <span class="title"
              ><span class="num">{{ i + 1 }}.</span> {{ r!.summary.title || `Tag ${r!.tagId}` }}</span
            >
            <span class="meta">
              <span v-if="r!.summary.key">{{ r!.summary.key }}</span>
              <span v-if="r!.summary.arranger">{{ r!.summary.arranger }}</span>
              <span class="badge" :data-on="!!(r!.audioBlobs && Object.keys(r!.audioBlobs).length)">{{
                r!.audioBlobs && Object.keys(r!.audioBlobs).length
                  ? 'Audio offline'
                  : r!.offlineMedia
                    ? 'Sheets offline'
                    : 'Metadata'
              }}</span>
            </span>
          </RouterLink>
          <div class="row-actions" :class="{ 'in-collection': !!activeCollectionId }">
            <button
              v-if="activeCollectionId"
              type="button"
              class="row-remove-col"
              :aria-label="`Remove ${r!.summary.title || r!.tagId} from collection`"
              title="Remove from this collection only — keeps it favorited"
              @click.stop="removeFromActiveCollection(r!.tagId)"
            >
              Remove from collection
            </button>
            <button
              type="button"
              class="row-fav"
              :aria-pressed="true"
              :aria-busy="stars.isTagCaching(r!.tagId)"
              :aria-label="rowStarLabel(r!.summary.title || '', r!.tagId)"
              :title="rowStarTip(r!.summary.title || '', r!.tagId)"
              @click.stop="requestUnfavorite(r!.tagId, r!.summary.title || '')"
            >
              <span
                v-if="stars.isTagCaching(r!.tagId)"
                class="row-fav-spinner"
                aria-hidden="true"
              />
              <span v-else>♥</span>
            </button>
          </div>
        </div>
      </li>
    </ol>

    <FilterSheet :open="backupOpen" title="Backup & restore" @close="backupOpen = false">
      <div class="backup">
        <p class="backup-desc">
          Your favorites and custom collections live in this browser only. <strong>Backup</strong> downloads a
          <code>favorites.tags</code> file with favorited tags, collection membership, and practice order.
          <strong>Restore</strong> replaces favorites and collections on this device from that file.
          Optionally fetch sheet and audio media during restore so tags work offline right away.
        </p>
        <div class="backup-actions">
          <span
            class="backup-tip"
            :title="
              stars.count
                ? undefined
                : 'Favorite at least one tag before backing up — there’s nothing to export yet.'
            "
          >
            <button
              type="button"
              class="primary"
              :disabled="!stars.count"
              :aria-disabled="!stars.count"
              @click="downloadStarredFile"
            >
              Backup favorites &amp; collections
            </button>
          </span>
          <button type="button" @click="fileInput?.click()">Restore from file…</button>
          <button
            type="button"
            class="toggle-btn"
            :class="{ on: fetchMediaOnImport }"
            :aria-pressed="fetchMediaOnImport"
            :disabled="offline"
            @click="fetchMediaOnImport = !fetchMediaOnImport"
          >
            Fetch media on restore
          </button>
        </div>
        <input
          ref="fileInput"
          type="file"
          accept=".tags,application/json,.json"
          class="sr"
          @change="onImportFile"
        />
      </div>
    </FilterSheet>

    <CollectionPickerSheet
      :open="addOpen"
      :tag-ids="addPickerTagIds"
      title="Add listed favorites to collection"
      @close="addOpen = false"
      @done="onAddedToCollection"
    />

    <FilterSheet :open="manageOpen" title="Manage collections" @close="manageOpen = false">
      <div class="manage">
        <p class="manage-desc">
          Collections group favorites for practice. They stay on this device. Unfavoriting a tag
          removes it from every collection.
        </p>
        <p v-if="manageError" class="manage-err" role="alert">{{ manageError }}</p>

        <ul v-if="collectionChips.length" class="manage-list" aria-label="Your collections">
          <li v-for="c in collectionChips" :key="c.id" class="manage-row">
            <label class="manage-field">
              <span class="manage-lbl">
                {{ c.name }}
                <span class="manage-count">{{ c.tagIds.length }} tag{{ c.tagIds.length === 1 ? '' : 's' }}</span>
              </span>
              <input
                v-model="renameDraft[c.id]"
                type="text"
                maxlength="80"
                :aria-label="`Rename ${c.name}`"
                @keydown.enter.prevent="saveRename(c.id)"
              />
            </label>
            <div class="manage-row-actions">
              <button
                type="button"
                class="manage-btn manage-btn-primary"
                :disabled="!(renameDraft[c.id] ?? '').trim() || (renameDraft[c.id] ?? '').trim() === c.name"
                @click="saveRename(c.id)"
              >
                Save name
              </button>
              <button type="button" class="manage-btn manage-btn-danger" @click="deleteCollection(c.id)">
                Delete
              </button>
            </div>
          </li>
        </ul>
        <p v-else class="manage-empty">No collections yet.</p>

        <div class="manage-create">
          <label class="manage-field">
            <span class="manage-lbl">New collection</span>
            <input
              v-model="newCollectionName"
              type="text"
              maxlength="80"
              placeholder="e.g. Contest set"
              aria-label="New collection name"
              @keydown.enter.prevent="createManagedCollection"
            />
          </label>
          <button
            type="button"
            class="manage-btn manage-btn-primary manage-create-btn"
            :disabled="!newCollectionName.trim()"
            @click="createManagedCollection"
          >
            Create
          </button>
        </div>
      </div>
    </FilterSheet>

    <ConfirmDialog
      :open="!!pendingUnfavorite"
      title="Unfavorite this tag?"
      :message="pendingUnfavorite
        ? `“${pendingUnfavorite.title || ('tag #' + pendingUnfavorite.tagId)}” will be removed from your favorites and from every collection.`
        : ''"
      confirm-label="Unfavorite"
      @close="pendingUnfavorite = null"
      @confirm="confirmPendingUnfavorite"
    />
  </section>
</template>

<style scoped>
.muted {
  color: var(--muted);
  margin: 0 0 1rem;
}
.intro {
  max-width: 36rem;
  line-height: 1.45;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-bottom: 1rem;
  align-items: center;
}
.actions button {
  min-height: 44px;
  padding: 0.55rem 0.9rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
}
.sort-field {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.9rem;
  color: var(--muted);
}
.sort-lbl {
  font-weight: 600;
}
.sort-field select {
  font: inherit;
  min-height: 44px;
  padding: 0.35rem 0.55rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}
.sort-field select:disabled {
  opacity: 0.5;
}
.actions .primary,
.backup-actions .primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.actions .primary:disabled {
  background: color-mix(in srgb, var(--muted) 35%, var(--surface));
  color: var(--muted);
  border-color: var(--border);
  cursor: not-allowed;
  opacity: 1;
}
.backup-actions .primary:disabled {
  background: color-mix(in srgb, var(--muted) 35%, var(--surface));
  color: var(--muted);
  border-color: var(--border);
  cursor: not-allowed;
  opacity: 1;
}
.backup-tip {
  display: inline-flex;
}
.backup-tip:has(button:disabled) {
  cursor: not-allowed;
}
.toggle-btn {
  min-height: 48px;
  padding: 0.55rem 1rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-weight: 600;
}
.toggle-btn.on {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  border-color: var(--accent);
  color: var(--accent-hover);
}
.toggle-btn:disabled {
  opacity: 0.5;
}
.backup {
  display: grid;
  gap: 1rem;
  padding: 0.25rem 0 0.5rem;
}
.backup-desc {
  margin: 0;
  color: var(--muted);
  font-size: 0.95rem;
  line-height: 1.45;
}
.backup-desc strong {
  color: var(--text);
  font-weight: 600;
}
.backup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
}
.backup-actions button {
  min-height: 44px;
  padding: 0.55rem 0.9rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
}
.progress {
  display: grid;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
  color: var(--muted);
}
.bar {
  height: 4px;
  border-radius: 2px;
  background: var(--accent);
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.5rem;
}
.list-dragging {
  user-select: none;
  cursor: grabbing;
}
.list-dragging .favorites-row:not(.dragging) {
  opacity: 0.55;
}
li {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.4rem;
  align-items: stretch;
  border-radius: var(--radius);
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease,
    opacity 0.12s ease;
}
li.dragging {
  z-index: 3;
  opacity: 1;
  transform: scale(1.02) translateY(-2px);
}
li.dragging .card,
li.dragging .drag-handle {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  box-shadow: 0 10px 28px color-mix(in srgb, var(--text) 18%, transparent);
}
li.dragging .drag-handle {
  color: var(--accent);
  cursor: grabbing;
}
li.drop-before::before,
li.drop-after::after {
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
li.drop-before::before {
  top: -0.28rem;
}
li.drop-after::after {
  bottom: -0.28rem;
}
.drag-handle {
  align-self: stretch;
  min-width: 40px;
  min-height: 44px;
  padding: 0 0.35rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-size: 1.05rem;
  line-height: 1;
  cursor: grab;
  touch-action: none;
}
.drag-handle:active {
  cursor: grabbing;
}
.card.no-nav .row-link {
  pointer-events: none;
}
.card {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.35rem;
  align-items: center;
  padding: 0.35rem 0.35rem 0.35rem 0.85rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  min-height: 44px;
  transition: border-color 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
}
.row-actions {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.4rem;
  flex-shrink: 0;
}
.row-actions.in-collection {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.4rem;
  align-items: center;
  min-width: 12.5rem;
  max-width: 16rem;
}
.row-remove-col {
  min-height: 44px;
  padding: 0.35rem 0.6rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
  cursor: pointer;
  white-space: normal;
}
.row-remove-col:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}
.row-link {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.55rem 0.35rem;
  color: inherit;
  text-decoration: none;
  min-width: 0;
  min-height: 44px;
  justify-content: center;
}
.row-link:hover {
  color: var(--accent-hover);
}
.title {
  font-weight: 600;
}
.num {
  color: var(--muted);
  font-weight: 500;
  margin-right: 0.15rem;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  color: var(--muted);
  font-size: 0.9rem;
}
.badge {
  color: var(--muted);
}
.badge[data-on='true'] {
  color: var(--accent);
  font-weight: 600;
}
.row-fav {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  padding: 0.35rem 0.55rem;
  align-self: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}
.row-fav:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}
.row-fav[aria-pressed='true'] {
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  border-color: var(--accent);
  color: var(--accent);
}
.row-fav[aria-busy='true'] {
  color: var(--muted);
}
.row-fav-spinner {
  display: block;
  width: 1.1rem;
  height: 1.1rem;
  margin: 0 auto;
  border: 2px solid color-mix(in srgb, var(--accent) 28%, transparent);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: row-fav-spin 0.65s linear infinite;
}
@keyframes row-fav-spin {
  to {
    transform: rotate(360deg);
  }
}
.ok {
  color: var(--accent);
}
.error {
  color: var(--danger);
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
code {
  font-size: 0.9em;
}

.collection-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0 0 0.65rem;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 36px;
  padding: 0.25rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
}
.chip.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--accent);
}
.chip-n {
  font-size: 0.75rem;
  font-weight: 700;
  opacity: 0.75;
}
.chip-add:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.collection-hint {
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
  color: var(--muted);
}
.linkish {
  margin-left: 0.45rem;
  border: 0;
  background: none;
  color: var(--accent);
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}
.manage {
  display: grid;
  gap: 0.9rem;
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
.manage-err {
  margin: 0;
  color: var(--danger, #9b2c2c);
  font-size: 0.9rem;
}
.manage-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
  max-height: min(45vh, 18rem);
  overflow: auto;
}
.manage-row {
  display: grid;
  gap: 0.45rem;
  padding: 0.65rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg, var(--surface));
}
.manage-field {
  display: grid;
  gap: 0.3rem;
  min-width: 0;
}
.manage-lbl {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
}
.manage-count {
  font-weight: 500;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.manage-row input,
.manage-create input {
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
.manage-row-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem;
}
.manage-btn {
  min-height: 44px;
  padding: 0.45rem 0.75rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
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
.manage-create {
  display: grid;
  gap: 0.55rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--border);
}
.manage-create-btn {
  width: 100%;
}
</style>
