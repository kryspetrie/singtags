<script setup lang="ts">
/**
 * Browse filter chips and anchored filter sheets (arranger, type, collection, year, title, cached).
 */
import {
  mergeBrowseCollectionOptions,
} from '../lib/collections'
import CustomCollectionMark from './CustomCollectionMark.vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { CatalogFilters } from '../search/filters'
import type { CachedFilter } from '../lib/offlineReadiness'
import { cachedFilterChipLabel, isOfflineBrowseFilterActive } from '../lib/offlineReadiness'
import {
  arrangersByLastInitial,
  formatArrangerLastFirst,
  TITLE_LETTER_FILTER_OPTIONS,
} from '../search/browse'
import FilterSheet from './FilterSheet.vue'

const props = defineProps<{
  /** Filter sheet open state. */
  open: boolean
  filters: CatalogFilters
  years: number[]
  arrangers: string[]
  types: string[]
  collections: string[]
  /** User-defined collections shown after catalog series. */
  userCollections?: Array<{ id: string; name: string }>
}>()

const emit = defineEmits<{
  patch: [Partial<CatalogFilters>]
  clear: []
}>()

const collectionOptions = computed(() =>
  mergeBrowseCollectionOptions(props.collections, props.userCollections ?? []),
)

/** Catalog series stay pinned; custom collections page in ~2-line chunks. */
const COLLECTION_SHEET_PAGE_SIZE = 6
const collectionSheetPage = ref(0)

const catalogCollectionOptions = computed(() => collectionOptions.value.filter((c) => !c.custom))
const customCollectionOptions = computed(() => collectionOptions.value.filter((c) => c.custom))

const customCollectionPageCount = computed(() =>
  Math.max(1, Math.ceil(customCollectionOptions.value.length / COLLECTION_SHEET_PAGE_SIZE)),
)

const showCustomCollectionPager = computed(
  () => customCollectionOptions.value.length > COLLECTION_SHEET_PAGE_SIZE,
)

const pagedCustomCollectionOptions = computed(() => {
  const start = collectionSheetPage.value * COLLECTION_SHEET_PAGE_SIZE
  return customCollectionOptions.value.slice(start, start + COLLECTION_SHEET_PAGE_SIZE)
})

watch(customCollectionPageCount, (n) => {
  if (collectionSheetPage.value > n - 1) {
    collectionSheetPage.value = Math.max(0, n - 1)
  }
})

const sheet = ref<'arranger' | 'type' | 'collection' | 'year' | 'title' | 'cached' | null>(null)
const arrangerQ = ref('')
const arrangerLetter = ref<string | null>(null)
const chipsWrap = ref<HTMLElement | null>(null)
/** Bottom of the filter chips in viewport coords — sheets stretch up to here on mobile. */
const sheetAnchorTop = ref<number | null>(null)

function measureSheetAnchor(): void {
  if (typeof window === 'undefined') return
  if (window.matchMedia('(min-width: 768px)').matches) {
    sheetAnchorTop.value = null
    return
  }
  const el = chipsWrap.value
  if (!el) {
    sheetAnchorTop.value = null
    return
  }
  const bottom = el.getBoundingClientRect().bottom
  // If chips scrolled off-screen, fall back to default sheet height.
  sheetAnchorTop.value = bottom > 48 ? Math.round(bottom) : null
}

function openSheet(kind: 'arranger' | 'type' | 'collection' | 'year' | 'title' | 'cached'): void {
  // Measure before opening so the panel mounts already anchored (enter animation uses final layout).
  measureSheetAnchor()
  sheet.value = kind
}

watch(sheet, (openSheet) => {
  if (!openSheet) {
    sheetAnchorTop.value = null
    return
  }
  if (openSheet === 'collection') collectionSheetPage.value = 0
  // Re-measure after paint in case layout shifted.
  void nextTick(() => measureSheetAnchor())
})

function onViewportChange(): void {
  if (sheet.value) measureSheetAnchor()
}

onMounted(() => {
  window.addEventListener('resize', onViewportChange)
  window.visualViewport?.addEventListener('resize', onViewportChange)
  window.visualViewport?.addEventListener('scroll', onViewportChange)
})

onUnmounted(() => {
  window.removeEventListener('resize', onViewportChange)
  window.visualViewport?.removeEventListener('resize', onViewportChange)
  window.visualViewport?.removeEventListener('scroll', onViewportChange)
})

const arrangerGroups = computed(() => arrangersByLastInitial(props.arrangers))

const filteredArrangerGroups = computed(() => {
  const q = arrangerQ.value.trim().toLowerCase()
  let groups = arrangerGroups.value
  if (arrangerLetter.value) {
    groups = groups.filter((g) => g.letter === arrangerLetter.value)
  }
  if (!q) return groups
  return groups
    .map((g) => ({
      letter: g.letter,
      names: g.names.filter(
        (a) =>
          a.toLowerCase().includes(q) ||
          formatArrangerLastFirst(a).toLowerCase().includes(q),
      ),
    }))
    .filter((g) => g.names.length)
})

function filtersActive(f: CatalogFilters): boolean {
  return (
    f.arrangers.length > 0 ||
    f.yearMin != null ||
    f.yearMax != null ||
    f.hasSheet === true ||
    f.hasAudio === true ||
    f.cached != null ||
    f.types.length > 0 ||
    f.collections.length > 0 ||
    f.titleLetters.length > 0
  )
}

function removeTitleLetter(letter: string): void {
  emit('patch', { titleLetters: props.filters.titleLetters.filter((x) => x !== letter) })
}

const hasActive = computed(() => filtersActive(props.filters))

const offlineBrowseActive = computed(() => isOfflineBrowseFilterActive(props.filters))

const sheetChipTitle = computed(() =>
  offlineBrowseActive.value
    ? 'Only show tags with sheet music cached on this device'
    : 'Only show tags that have sheet music',
)

const audioChipTitle = computed(() =>
  offlineBrowseActive.value
    ? 'Only show tags with learning tracks cached on this device'
    : 'Only show tags that have learning tracks',
)

const offlineChipLabel = computed(() => {
  const suffix = cachedFilterChipLabel(props.filters.cached)
  return suffix ? `Cached: ${suffix}` : 'Cached on device'
})

const offlineChipTitle =
  'Filter by files cached on this device (any sheet/audio blob; not always Mix-ready)'

const yearChipLabel = computed(() => {
  const { yearMin, yearMax } = props.filters
  if (yearMin != null && yearMax != null) {
    return yearMin === yearMax ? String(yearMin) : `${yearMin}–${yearMax}`
  }
  if (yearMin != null) return `${yearMin}+`
  if (yearMax != null) return `–${yearMax}`
  return 'Year'
})

function toggleSheet(): void {
  emit('patch', { hasSheet: props.filters.hasSheet === true ? null : true })
}
function toggleAudio(): void {
  emit('patch', { hasAudio: props.filters.hasAudio === true ? null : true })
}
function setCached(raw: string): void {
  emit('patch', { cached: (raw || null) as CachedFilter })
  sheet.value = null
}
function setYearMin(raw: string): void {
  const yearMin = raw === '' ? null : Number(raw)
  let yearMax = props.filters.yearMax
  if (yearMin != null && yearMax != null && yearMin > yearMax) yearMax = yearMin
  emit('patch', { yearMin, yearMax })
}
function setYearMax(raw: string): void {
  const yearMax = raw === '' ? null : Number(raw)
  let yearMin = props.filters.yearMin
  if (yearMin != null && yearMax != null && yearMin > yearMax) yearMin = yearMax
  emit('patch', { yearMin, yearMax })
}
function clearYearRange(): void {
  emit('patch', { yearMin: null, yearMax: null })
}
function toggleArranger(a: string): void {
  const arrangers = props.filters.arrangers.includes(a)
    ? props.filters.arrangers.filter((x) => x !== a)
    : [...props.filters.arrangers, a]
  emit('patch', { arrangers })
}
function toggleType(t: string): void {
  const types = props.filters.types.includes(t)
    ? props.filters.types.filter((x) => x !== t)
    : [...props.filters.types, t]
  emit('patch', { types })
}
function toggleCollection(c: string): void {
  const collections = props.filters.collections.includes(c)
    ? props.filters.collections.filter((x) => x !== c)
    : [...props.filters.collections, c]
  emit('patch', { collections })
}
function toggleTitleLetter(letter: string): void {
  const titleLetters = props.filters.titleLetters.includes(letter)
    ? props.filters.titleLetters.filter((x) => x !== letter)
    : [...props.filters.titleLetters, letter]
  emit('patch', { titleLetters })
}

function removeArranger(a: string): void {
  emit('patch', { arrangers: props.filters.arrangers.filter((x) => x !== a) })
}
</script>

<template>
  <div ref="chipsWrap" class="chips-wrap">
    <div v-show="open" class="chip-row" role="toolbar" aria-label="Search filters">
      <button
        type="button"
        class="chip"
        :class="{ on: filters.hasSheet === true }"
        :aria-pressed="filters.hasSheet === true"
        :title="sheetChipTitle"
        @click="toggleSheet"
      >
        Has sheet
      </button>
      <button
        type="button"
        class="chip"
        :class="{ on: filters.hasAudio === true }"
        :aria-pressed="filters.hasAudio === true"
        :title="audioChipTitle"
        @click="toggleAudio"
      >
        Has audio
      </button>
      <button
        type="button"
        class="chip"
        :class="{ on: filters.cached != null }"
        :title="offlineChipTitle"
        @click="openSheet('cached')"
      >
        {{ offlineChipLabel }}
      </button>
      <button
        type="button"
        class="chip"
        :class="{ on: filters.yearMin != null || filters.yearMax != null }"
        title="Filter by calendar year range"
        @click="openSheet('year')"
      >
        {{ yearChipLabel }}
      </button>
      <button
        type="button"
        class="chip"
        :class="{ on: filters.titleLetters.length > 0 }"
        title="Filter by title initial"
        @click="openSheet('title')"
      >
        Title{{ filters.titleLetters.length ? ` (${filters.titleLetters.length})` : '' }}
      </button>
      <button
        type="button"
        class="chip"
        :class="{ on: filters.arrangers.length > 0 }"
        title="Filter by arranger"
        @click="openSheet('arranger')"
      >
        Arranger{{ filters.arrangers.length ? ` (${filters.arrangers.length})` : '' }}
      </button>
      <button
        v-if="types.length"
        type="button"
        class="chip"
        :class="{ on: filters.types.length > 0 }"
        title="Filter by tag type"
        @click="openSheet('type')"
      >
        Type{{ filters.types.length ? ` (${filters.types.length})` : '' }}
      </button>
      <button
        v-if="collectionOptions.length"
        type="button"
        class="chip"
        :class="{ on: filters.collections.length > 0 }"
        title="Filter by collection"
        @click="openSheet('collection')"
      >
        Collection{{ filters.collections.length ? ` (${filters.collections.length})` : '' }}
      </button>
      <button
        v-if="hasActive"
        type="button"
        class="chip clear"
        title="Remove all active filters"
        @click="$emit('clear')"
      >
        Clear filters
      </button>
    </div>

    <div v-if="open && filters.arrangers.length" class="active">
      <button
        v-for="a in filters.arrangers"
        :key="'a-' + a"
        type="button"
        class="chip on sm"
        :title="`Remove arranger filter: ${a}`"
        @click="removeArranger(a)"
      >
        {{ a }} ✕
      </button>
    </div>

    <div v-if="open && filters.titleLetters.length" class="active">
      <button
        v-for="letter in filters.titleLetters"
        :key="'tl-' + letter"
        type="button"
        class="chip on sm"
        :title="`Remove title letter filter: ${letter}`"
        @click="removeTitleLetter(letter)"
      >
        Title {{ letter }} ✕
      </button>
    </div>

    <FilterSheet
      :open="sheet === 'cached'"
      title="Cached files on this device"
      :anchor-top="sheetAnchorTop"
      @close="sheet = null"
    >
      <p class="hint">
        Filters by files already on this phone. Cached sheets or audio do not guarantee a full
        offline Mix (tracks may still be missing).
      </p>
      <label class="cached-field">
        <span>Cached on device</span>
        <select
          :value="filters.cached ?? ''"
          aria-label="Cached on device"
          @change="setCached(($event.target as HTMLSelectElement).value)"
        >
          <option value="">No filter</option>
          <option value="any">Has any cached files</option>
          <option value="sheets">Has cached sheet files</option>
          <option value="audio">Has cached audio files</option>
          <option value="both">Has cached sheet + audio</option>
          <option value="none">No cached files</option>
        </select>
      </label>
    </FilterSheet>

    <FilterSheet
      :open="sheet === 'year'"
      title="Year range"
      :anchor-top="sheetAnchorTop"
      @close="sheet = null"
    >
      <p class="hint">Inclusive calendar years. Tags without a year are hidden when a range is set.</p>
      <div class="year-row">
        <label class="year-field">
          <span>From</span>
          <select
            :value="filters.yearMin ?? ''"
            aria-label="Year from"
            @change="setYearMin(($event.target as HTMLSelectElement).value)"
          >
            <option value="">Any</option>
            <option v-for="y in years" :key="'min-' + y" :value="y">{{ y }}</option>
          </select>
        </label>
        <label class="year-field">
          <span>To</span>
          <select
            :value="filters.yearMax ?? ''"
            aria-label="Year to"
            @change="setYearMax(($event.target as HTMLSelectElement).value)"
          >
            <option value="">Any</option>
            <option v-for="y in years" :key="'max-' + y" :value="y">{{ y }}</option>
          </select>
        </label>
      </div>
      <button
        v-if="filters.yearMin != null || filters.yearMax != null"
        type="button"
        class="btn"
        @click="clearYearRange"
      >
        Clear year range
      </button>
    </FilterSheet>

    <FilterSheet
      :open="sheet === 'title'"
      title="Title (initial)"
      :anchor-top="sheetAnchorTop"
      @close="sheet = null"
    >
      <div class="opts wrap">
        <button
          v-for="letter in TITLE_LETTER_FILTER_OPTIONS"
          :key="letter"
          type="button"
          class="chip"
          :class="{ on: filters.titleLetters.includes(letter) }"
          @click="toggleTitleLetter(letter)"
        >
          {{ letter }}
        </button>
      </div>
    </FilterSheet>

    <FilterSheet
      :open="sheet === 'arranger'"
      title="Arranger (by last name)"
      :anchor-top="sheetAnchorTop"
      @close="sheet = null; arrangerLetter = null; arrangerQ = ''"
    >
      <input
        v-model="arrangerQ"
        type="search"
        class="search"
        placeholder="Search arrangers"
        aria-label="Search arrangers"
      />
      <div class="letter-rail" role="toolbar" aria-label="Last name A–Z">
        <button
          type="button"
          class="chip sm"
          :class="{ on: arrangerLetter == null }"
          @click="arrangerLetter = null"
        >
          All
        </button>
        <button
          v-for="g in arrangerGroups"
          :key="g.letter"
          type="button"
          class="chip sm"
          :class="{ on: arrangerLetter === g.letter }"
          @click="arrangerLetter = g.letter"
        >
          {{ g.letter }}
        </button>
      </div>
      <div class="arranger-groups">
        <div v-for="g in filteredArrangerGroups" :key="g.letter" class="arranger-group">
          <h3 class="arranger-letter">{{ g.letter }}</h3>
          <div class="opts wrap">
            <button
              v-for="a in g.names"
              :key="a"
              type="button"
              class="chip"
              :class="{ on: filters.arrangers.includes(a) }"
              @click="toggleArranger(a)"
            >
              {{ formatArrangerLastFirst(a) }}
            </button>
          </div>
        </div>
        <p v-if="!filteredArrangerGroups.length" class="empty-arr">No arrangers match.</p>
      </div>
    </FilterSheet>

    <FilterSheet
      :open="sheet === 'type'"
      title="Type"
      :anchor-top="sheetAnchorTop"
      @close="sheet = null"
    >
      <div class="opts wrap">
        <button
          v-for="t in types"
          :key="t"
          type="button"
          class="chip"
          :class="{ on: filters.types.includes(t) }"
          @click="toggleType(t)"
        >
          {{ t }}
        </button>
      </div>
    </FilterSheet>

    <FilterSheet
      :open="sheet === 'collection'"
      title="Collection"
      :anchor-top="sheetAnchorTop"
      @close="sheet = null"
    >
      <div class="opts wrap collection-opts">
        <button
          v-for="c in catalogCollectionOptions"
          :key="c.id"
          type="button"
          class="chip"
          :class="{ on: filters.collections.includes(c.id) }"
          @click="toggleCollection(c.id)"
        >
          {{ c.label }}
        </button>
        <button
          v-for="c in pagedCustomCollectionOptions"
          :key="c.id"
          type="button"
          class="chip custom"
          :class="{ on: filters.collections.includes(c.id) }"
          @click="toggleCollection(c.id)"
        >
          <CustomCollectionMark />
          {{ c.label }}
        </button>
      </div>
      <div
        v-if="showCustomCollectionPager"
        class="collection-pager"
        role="group"
        aria-label="Your collection pages"
      >
        <button
          type="button"
          class="btn"
          :disabled="collectionSheetPage <= 0"
          aria-label="Previous collection page"
          @click="collectionSheetPage -= 1"
        >
          ← Prev
        </button>
        <span class="collection-page-ind" aria-live="polite">
          {{ collectionSheetPage + 1 }} / {{ customCollectionPageCount }}
        </span>
        <button
          type="button"
          class="btn"
          :disabled="collectionSheetPage >= customCollectionPageCount - 1"
          aria-label="Next collection page"
          @click="collectionSheetPage += 1"
        >
          Next →
        </button>
      </div>
    </FilterSheet>
  </div>
</template>

<style scoped>
.chips-wrap {
  display: grid;
  gap: 0.45rem;
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  padding-bottom: 0.15rem;
}
.active {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.chip {
  flex: 0 0 auto;
  min-height: 40px;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-size: 0.88rem;
  white-space: nowrap;
}
.chip:disabled {
  opacity: 0.55;
}
.chip.custom {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.chip.on {
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  border-color: var(--accent);
  color: var(--accent-hover);
  font-weight: 600;
}
.chip.dim {
  opacity: 0.75;
}
.chip.clear {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 35%, var(--border));
}
.chip.sm {
  min-height: 34px;
  font-size: 0.8rem;
}
.warn {
  margin: 0;
  font-size: 0.85rem;
  color: var(--danger);
}
.hint {
  margin: 0 0 0.5rem;
  color: var(--muted);
  font-size: 0.9rem;
}
.opts {
  display: grid;
  gap: 0.5rem;
}
.opts.wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0.15rem 0.1rem;
}
.collection-opts {
  /* ~2 chip rows; paging handles overflow for custom collections. */
  --collection-chip-row: calc(40px + 2px);
  max-height: calc(var(--collection-chip-row) * 2 + 0.4rem + 0.3rem);
  overflow: hidden;
  align-content: flex-start;
  padding: 0.15rem 0.1rem;
  margin-bottom: 0.55rem;
  box-sizing: border-box;
}
.collection-pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}
.collection-pager .btn {
  min-height: 36px;
  padding: 0.3rem 0.65rem;
  font-size: 0.85rem;
}
.collection-page-ind {
  font-size: 0.85rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  min-width: 3.5rem;
  text-align: center;
}
.year-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.year-field {
  display: grid;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--muted);
}
.year-field select {
  min-height: 44px;
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  font: inherit;
  font-size: 16px;
  background: var(--surface);
  color: inherit;
}
.cached-field {
  display: grid;
  gap: 0.35rem;
  color: var(--muted);
  font-size: 0.85rem;
}
.cached-field select {
  min-height: 44px;
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 16px;
}
.search {
  width: 100%;
  min-height: 44px;
  margin-bottom: 0.65rem;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  font: inherit;
  font-size: 16px;
  box-sizing: border-box;
}
.letter-rail {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 0.75rem;
  max-height: 7rem;
  overflow: auto;
}
.arranger-groups {
  display: grid;
  gap: 0.85rem;
  max-height: min(50vh, 28rem);
  overflow: auto;
}
.arranger-letter {
  margin: 0 0 0.35rem;
  font-size: 0.85rem;
  color: var(--muted);
  letter-spacing: 0.04em;
}
.empty-arr {
  margin: 0;
  color: var(--muted);
}
@media (min-width: 768px) {
  .chip {
    min-height: 44px;
  }
  .collection-opts {
    --collection-chip-row: calc(44px + 2px);
  }
}
</style>
