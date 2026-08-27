<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import EmptyState from '../components/EmptyState.vue'
import FilterSheet from '../components/FilterSheet.vue'
import StarsNoticeLine from '../components/StarsNoticeLine.vue'
import { useStarsStore } from '../stores/stars'
import { usePracticeStore } from '../stores/practice'
import { useOnline } from '../composables/useOnline'

const stars = useStarsStore()
const practice = usePracticeStore()
const { offline } = useOnline()
const router = useRouter()
const fileInput = ref<HTMLInputElement | null>(null)
const fetchMediaOnImport = ref(false)
const backupOpen = ref(false)

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
  return practice.order.map((id) => byId.get(id)).filter(Boolean)
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
  const row = el?.closest<HTMLElement>('li.starred-row')
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
    if (toIndex != null) practice.reorder(draggingId.value, toIndex)
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
  const data = stars.exportFile()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'starred.tags'
  a.click()
  URL.revokeObjectURL(url)
}

async function onImportFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    await stars.importFromJson(JSON.parse(text), fetchMediaOnImport.value && !offline.value)
    backupOpen.value = false
  } catch (err) {
    stars.error = err instanceof Error ? err.message : String(err)
  } finally {
    input.value = ''
  }
}

async function refreshOne(tagId: number): Promise<void> {
  await stars.updateOfflineMedia(tagId, null)
}

function startPractice(): void {
  practice.syncFromStarred(stars.records.map((r) => r.tagId))
  const first = practice.firstId()
  if (first == null) return
  void router.push({ path: `/tag/${first}`, query: { set: 'practice' } })
}

function resetOrder(): void {
  practice.resetFromStarred(stars.records.map((r) => r.tagId))
}
</script>

<template>
  <section class="starred" aria-label="Starred">
    <p class="muted intro">
      Offline favorites on this device. Hold the handle and drag to reorder, then start a practice set
      that auto-advances through tags.
      <RouterLink to="/settings">Offline library settings</RouterLink>
    </p>

    <div class="actions">
      <button
        type="button"
        class="primary"
        :disabled="!stars.count"
        @click="startPractice"
      >
        Start practice
      </button>
      <button type="button" :disabled="!stars.count" @click="resetOrder">Reset order</button>
      <button
        type="button"
        class="toggle-btn"
        :class="{ on: practice.autoAdvance }"
        :aria-pressed="practice.autoAdvance"
        @click="practice.autoAdvance = !practice.autoAdvance"
      >
        Auto-advance
      </button>
      <button type="button" @click="backupOpen = true">Backup &amp; restore</button>
    </div>

    <div v-if="stars.progress" class="progress" role="status">
      <div class="bar" :style="{ width: `${Math.round(stars.progress.ratio * 100)}%` }" />
      <span>{{ stars.progress.label }}</span>
    </div>
    <p v-if="stars.lastNotice" class="ok stars-notice-wrap" role="status">
      <StarsNoticeLine :notice="stars.lastNotice" />
    </p>
    <p v-if="stars.error" class="error" role="alert">{{ stars.error }}</p>

    <p v-if="!stars.loaded" class="text-muted" role="status">Loading starred tags…</p>
    <EmptyState
      v-else-if="!stars.records.length"
      title="No starred tags yet"
      message="Star from Browse or a tag page to save for quick recall, offline use, and practice sets."
    />

    <ol
      v-else
      class="list"
      :class="{ 'list-dragging': dragActive }"
      aria-label="Starred tags"
    >
      <li
        v-for="(r, i) in orderedRecords"
        :key="r!.tagId"
        class="starred-row"
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
        <RouterLink
          :to="{ path: `/tag/${r!.tagId}`, query: { set: 'practice' } }"
          class="card"
          :class="{ 'no-nav': dragActive }"
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
        <button
          v-if="!offline"
          type="button"
          class="refresh"
          :disabled="stars.busy"
          :aria-label="`Update offline media for ${r!.summary.title || r!.tagId}`"
          @click="refreshOne(r!.tagId)"
        >
          ↻
        </button>
        <button
          type="button"
          class="unstar"
          :aria-label="`Unstar ${r!.summary.title || r!.tagId}`"
          @click="stars.unstar(r!.tagId)"
        >
          ★
        </button>
      </li>
    </ol>

    <FilterSheet :open="backupOpen" title="Backup & restore" @close="backupOpen = false">
      <div class="backup">
        <p class="backup-desc">
          Your starred list lives in this browser only. <strong>Backup</strong> downloads a
          <code>starred.tags</code> file with your tags and practice order so you can keep a copy or
          move it to another device. <strong>Restore</strong> replaces the list on this device from
          that file. Optionally fetch sheet and audio media during restore so tags work offline right
          away.
        </p>
        <div class="backup-actions">
          <span
            class="backup-tip"
            :title="
              stars.count
                ? undefined
                : 'Star at least one tag before backing up — there’s nothing to export yet.'
            "
          >
            <button
              type="button"
              class="primary"
              :disabled="!stars.count"
              :aria-disabled="!stars.count"
              @click="downloadStarredFile"
            >
              Backup starred list
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
.actions .primary,
.backup-actions .primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
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
.list-dragging .starred-row:not(.dragging) {
  opacity: 0.55;
}
li {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto auto;
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
li.dragging .drag-handle,
li.dragging .refresh,
li.dragging .unstar {
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
.card.no-nav {
  pointer-events: none;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.9rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: inherit;
  text-decoration: none;
  min-height: 44px;
  transition: border-color 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
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
.refresh,
.unstar {
  min-width: 44px;
  min-height: 44px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--accent);
  font-size: 1.2rem;
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
</style>
