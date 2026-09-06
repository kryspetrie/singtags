<script setup lang="ts">
/**
 * Tag Roulette: modes with distribution slices, deal batch, sung/reset.
 * Reel pick is Phase 3 — see docs/plans/tag-roulette-impl.md.
 */
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import RouletteModeEditor from '../components/RouletteModeEditor.vue'
import RoulettePickModal from '../components/RoulettePickModal.vue'
import TagListRowContent from '../components/TagListRowContent.vue'
import {
  ROULETTE_BATCH_SIZES,
  summarizeMode,
  type RouletteBatchSize,
  type RoulettePoolContext,
} from '../lib/rouletteDraw'
import type { TagSummary } from '../types/tag'
import { useCatalogStore } from '../stores/catalog'
import { useFavoritesStore } from '../stores/favorites'
import { usePreferencesStore } from '../stores/preferences'
import { useRouletteStore, type RouletteBatchItem } from '../stores/roulette'
import { useUserCollectionsStore } from '../stores/userCollections'

const catalog = useCatalogStore()
const prefs = usePreferencesStore()
const roulette = useRouletteStore()
const favorites = useFavoritesStore()
const userCollections = useUserCollectionsStore()
const router = useRouter()

const loading = ref(true)
const loadError = ref<string | null>(null)
const showEditor = ref(false)
const pickOpen = ref(false)

const favoriteGroups = computed(() =>
  userCollections.collections.map((c) => ({
    id: c.id,
    name: c.name,
    tagIds: c.tagIds,
  })),
)

const canDeal = computed(() => !loading.value && catalog.tags.length > 0)
const modeSummary = computed(() => summarizeMode(roulette.activeMode, favoriteGroups.value))
const canPick = computed(
  () =>
    roulette.items.length >= 2 &&
    roulette.items.some((it) => !roulette.isWheelUsed(it.id)),
)

function poolContext(): RoulettePoolContext {
  return {
    favoriteIds: favorites.ids,
    favoriteGroups: favoriteGroups.value,
  }
}

onMounted(async () => {
  loading.value = true
  loadError.value = null
  try {
    await Promise.all([catalog.load(), favorites.ensureLoaded()])
    void catalog.ensureLyrics()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Could not load catalog'
  } finally {
    loading.value = false
  }
})

function onModeChange(e: Event): void {
  roulette.setActiveModeId((e.target as HTMLSelectElement).value)
}

function onNewMode(): void {
  roulette.addMode()
  showEditor.value = true
}

function onBatchSize(e: Event): void {
  roulette.setBatchSize(Number((e.target as HTMLSelectElement).value) as RouletteBatchSize)
}

function deal(): void {
  if (!canDeal.value) return
  roulette.dealBatch(catalog.tags, undefined, poolContext())
}

function reset(): void {
  roulette.resetBatch()
}

function openPick(): void {
  if (roulette.items.length < 2) return
  pickOpen.value = true
}

function onPicked(id: number): void {
  roulette.markWheelUsed(id)
}

function tagOpenTo(id: number): { path: string; query?: Record<string, string> } {
  const query: Record<string, string> = {}
  if (prefs.singMode || roulette.openAutomatically) query.fullscreen = '1'
  return { path: `/tag/${id}`, query: Object.keys(query).length ? query : undefined }
}

function onOpen(id: number): void {
  roulette.markSung(id)
  pickOpen.value = false
  void router.push(tagOpenTo(id))
}

const tagsById = computed(() => {
  const map = new Map<number, TagSummary>()
  for (const t of catalog.tags) map.set(t.id, t)
  return map
})

function rowTag(item: RouletteBatchItem): TagSummary {
  return (
    tagsById.value.get(item.id) ?? {
      id: item.id,
      title: item.title,
      altTitle: item.altTitle,
      arranger: item.arranger,
      key: null,
      rating: item.rating,
      type: null,
      collection: item.collection,
      classic: item.classic,
      hasSheet: false,
      audioParts: [],
      sheet: null,
    }
  )
}
</script>

<template>
  <section class="roulette" aria-label="Tag Roulette">
    <header class="head">
      <h1 class="title">Tag Roulette</h1>
      <p class="intro">
        Build a mode from weighted pools and score curves, deal a batch, open tags to mark them
        sung. Reset clears sung marks without dealing again.
      </p>
    </header>

    <div class="mode-bar" role="group" aria-label="Roulette mode">
      <label class="mode-select">
        <span class="lbl">Mode</span>
        <select
          :value="roulette.activeModeId"
          aria-label="Active roulette mode"
          @change="onModeChange"
        >
          <option v-for="m in roulette.modes" :key="m.id" :value="m.id">{{ m.label }}</option>
        </select>
      </label>
      <div class="mode-actions">
        <button
          type="button"
          class="icon-btn"
          aria-label="New mode"
          title="New mode"
          @click="onNewMode"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <button
          type="button"
          class="icon-btn"
          aria-label="Duplicate mode"
          title="Duplicate mode"
          @click="roulette.addMode(roulette.activeMode); showEditor = true"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="8" y="8" width="12" height="12" rx="2" />
            <path d="M4 16V6a2 2 0 0 1 2-2h10" />
          </svg>
        </button>
        <button
          type="button"
          class="icon-btn"
          :disabled="roulette.isBuiltinActive"
          :aria-label="roulette.isBuiltinActive ? 'Built-in modes cannot be deleted' : 'Delete mode'"
          :title="roulette.isBuiltinActive ? 'Built-in modes cannot be deleted' : 'Delete mode'"
          @click="roulette.deleteActiveMode()"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 7h16M9 7V5h6v2M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
          </svg>
        </button>
        <button
          type="button"
          class="icon-btn"
          :class="{ on: showEditor }"
          :aria-expanded="showEditor"
          :aria-label="showEditor ? 'Hide settings' : 'Edit mode'"
          :title="showEditor ? 'Hide settings' : 'Edit mode'"
          @click="showEditor = !showEditor"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 6h10M4 12h16M4 18h12" />
            <circle cx="18" cy="6" r="2" />
            <circle cx="8" cy="12" r="2" />
            <circle cx="16" cy="18" r="2" />
          </svg>
        </button>
      </div>
    </div>

    <p class="mode-summary">{{ modeSummary }}</p>

    <RouletteModeEditor v-if="showEditor" />

    <div class="deal-bar">
      <label class="batch-field">
        <span class="lbl">Batch size</span>
        <select
          :value="roulette.activeMode.batchSize"
          aria-label="Batch size"
          @change="onBatchSize"
        >
          <option v-for="n in ROULETTE_BATCH_SIZES" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>
      <div class="controls" role="group" aria-label="Deal controls">
        <button type="button" class="btn btn-primary" :disabled="!canDeal" @click="deal">
          Deal batch
        </button>
        <button
          type="button"
          class="btn btn-primary pick"
          :disabled="!canPick"
          :title="
            roulette.items.length < 2
              ? 'Pick one needs at least two tags in the batch'
              : 'Spin the reel to pick one tag from this batch'
          "
          @click="openPick"
        >
          Pick one
        </button>
        <button
          type="button"
          class="btn"
          :disabled="!roulette.items.length"
          title="Clear sung and picks; keep this batch"
          @click="reset"
        >
          Reset
        </button>
      </div>
    </div>

    <p v-if="loading" class="status">Loading catalog…</p>
    <p v-else-if="loadError" class="status error" role="alert">{{ loadError }}</p>
    <p v-else-if="!catalog.tags.length" class="status">
      Catalog is empty — open Browse once online to load tags, then return here.
    </p>
    <p v-else-if="roulette.dealStatus" class="status notice">{{ roulette.dealStatus }}</p>
    <p v-else-if="!roulette.items.length" class="status">Deal a batch to get started.</p>
    <p v-else-if="roulette.items.length === 1" class="status">
      Only one tag in this batch — open it from the list (no reel).
    </p>
    <p v-else-if="!canPick" class="status">
      All tags were picked — Reset to spin again, or Deal a new batch.
    </p>

    <ul v-if="roulette.items.length" class="batch-list" aria-label="Current batch">
      <li
        v-for="item in roulette.items"
        :key="item.id"
        class="row"
        :class="{ sung: roulette.isSung(item.id), picked: roulette.isWheelUsed(item.id) }"
      >
        <RouterLink
          class="row-link"
          :to="tagOpenTo(item.id)"
          @click="roulette.markSung(item.id)"
        >
          <TagListRowContent
            :tag="rowTag(item)"
            :lyrics-snippet="catalog.lyricsSnippet(item.id)"
          >
            <template #extra-meta>
              <span v-if="roulette.isSung(item.id)" class="pill">Sung</span>
              <span v-else-if="roulette.isWheelUsed(item.id)" class="pill accent">Picked</span>
            </template>
          </TagListRowContent>
        </RouterLink>
      </li>
    </ul>

    <RoulettePickModal
      :open="pickOpen"
      :items="roulette.items"
      :wheel-used-ids="roulette.wheelUsedIds"
      :open-automatically="roulette.openAutomatically"
      @close="pickOpen = false"
      @landed="onPicked"
      @open-tag="onOpen"
      @update:open-automatically="roulette.setOpenAutomatically($event)"
    />
  </section>
</template>

<style scoped>
.roulette {
  display: grid;
  gap: 0.85rem;
  width: 100%;
  max-width: 42rem;
  margin: 0 auto;
  padding: 0.25rem 0 1.5rem;
}
.head {
  display: grid;
  gap: 0.35rem;
}
.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.45rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
}
.intro {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
}
.mode-bar {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.4rem;
  align-items: end;
}
.mode-select {
  display: grid;
  gap: 0.25rem;
  flex: 1 1 auto;
  min-width: 0;
}
.lbl {
  font-size: 0.78rem;
  font-weight: 650;
  color: var(--muted);
}
.mode-select select {
  min-height: var(--touch);
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  width: 100%;
  min-width: 0;
}
.mode-actions {
  display: flex;
  flex-shrink: 0;
  gap: 0.15rem;
  align-items: center;
  padding-bottom: 0;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--touch);
  height: var(--touch);
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.icon-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--border) 35%, var(--surface));
}
.icon-btn.on {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.icon-btn svg {
  display: block;
}
.mode-summary {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted);
  line-height: 1.4;
}
.deal-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  align-items: end;
}
.batch-field {
  display: grid;
  gap: 0.25rem;
  flex: 0 0 auto;
}
.batch-field select {
  min-height: var(--touch);
  min-width: 4.5rem;
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
}
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  align-items: center;
  flex: 1 1 auto;
}
.btn-primary {
  background: var(--accent);
  color: #fff;
  border: 1px solid var(--accent);
  border-radius: 8px;
  min-height: var(--touch);
  padding: 0.4rem 0.9rem;
  font-weight: 650;
}
.btn-primary:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}
.btn-primary:disabled,
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.status {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}
.status.error {
  color: var(--danger);
}
.status.notice {
  color: var(--text);
  padding: 0.45rem 0.6rem;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  font-size: 0.85rem;
}
.batch-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}
.row {
  display: block;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  overflow: hidden;
}
.row.sung {
  opacity: 0.55;
  background: color-mix(in srgb, var(--muted) 8%, var(--surface));
}
.row.picked {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  box-shadow: inset 3px 0 0 var(--accent);
}
.row-link {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  padding: 0.55rem 0.75rem;
  text-decoration: none;
  color: inherit;
  min-height: 56px;
  justify-content: center;
}
.row-link:hover {
  background: color-mix(in srgb, var(--accent) 6%, var(--surface));
  color: var(--accent-hover);
}
.row-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.pill {
  display: inline-block;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 650;
  color: var(--muted);
  background: color-mix(in srgb, var(--muted) 14%, var(--surface));
  border: 1px solid var(--border);
}
.pill.accent {
  color: var(--accent-hover);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
}
.btn-primary.pick {
  background: color-mix(in srgb, var(--accent) 88%, var(--surface));
}
</style>
