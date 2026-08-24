<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CatalogFilters } from '../search/filters'
import { arrangersByLastInitial, formatArrangerLastFirst } from '../search/browse'
import FilterSheet from './FilterSheet.vue'

const props = defineProps<{
  filters: CatalogFilters
  keys: string[]
  arrangers: string[]
  types: string[]
  collections: string[]
  lyricsLoading?: boolean
  lyricsLoaded?: boolean
}>()

const emit = defineEmits<{
  patch: [Partial<CatalogFilters>]
  clear: []
  'ensure-lyrics': []
}>()

const sheet = ref<'key' | 'arranger' | 'type' | 'collection' | 'rating' | null>(null)
const arrangerQ = ref('')
const arrangerLetter = ref<string | null>(null)

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

const ftsPending = computed(() => props.filters.fullText && !props.lyricsLoaded)

watch(
  () => props.filters.fullText,
  (v) => {
    if (v) emit('ensure-lyrics')
  },
)

function toggleFullText(): void {
  if (!props.filters.fullText && props.lyricsLoading) return
  emit('patch', { fullText: !props.filters.fullText })
}
function cycleSheet(): void {
  const cur = props.filters.hasSheet
  emit('patch', { hasSheet: cur === null ? true : cur === true ? false : null })
}
function cycleAudio(): void {
  const cur = props.filters.hasAudio
  emit('patch', { hasAudio: cur === null ? true : cur === true ? false : null })
}
function setRating(n: number | null): void {
  emit('patch', { minRating: n })
  sheet.value = null
}
function toggleKey(k: string): void {
  const keys = props.filters.keys.includes(k)
    ? props.filters.keys.filter((x) => x !== k)
    : [...props.filters.keys, k]
  emit('patch', { keys })
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

function removeKey(k: string): void {
  emit('patch', { keys: props.filters.keys.filter((x) => x !== k) })
}
function removeArranger(a: string): void {
  emit('patch', { arrangers: props.filters.arrangers.filter((x) => x !== a) })
}

const hasActive = computed(() => filtersActive(props.filters))

function filtersActive(f: CatalogFilters): boolean {
  return (
    f.keys.length > 0 ||
    f.arrangers.length > 0 ||
    f.minRating != null ||
    f.hasSheet != null ||
    f.hasAudio != null ||
    f.fullText ||
    f.types.length > 0 ||
    f.collections.length > 0
  )
}
</script>

<template>
  <div class="chips-wrap">
    <div class="chip-row" role="toolbar" aria-label="Search filters">
      <button
        type="button"
        class="chip"
        :class="{ on: filters.fullText }"
        :aria-pressed="filters.fullText"
        :disabled="lyricsLoading && !filters.fullText"
        @click="toggleFullText"
      >
        {{ lyricsLoading && !filters.fullText ? 'Full text (loading…)' : 'Full text' }}
      </button>
      <button
        type="button"
        class="chip"
        :class="{ on: filters.hasSheet === true, dim: filters.hasSheet === false }"
        :aria-pressed="filters.hasSheet === true"
        @click="cycleSheet"
      >
        {{ filters.hasSheet === false ? 'No sheet' : 'Has sheet' }}
      </button>
      <button
        type="button"
        class="chip"
        :class="{ on: filters.hasAudio === true, dim: filters.hasAudio === false }"
        :aria-pressed="filters.hasAudio === true"
        @click="cycleAudio"
      >
        {{ filters.hasAudio === false ? 'No audio' : 'Has audio' }}
      </button>
      <button type="button" class="chip" :class="{ on: filters.minRating != null }" @click="sheet = 'rating'">
        {{ filters.minRating != null ? `★ ${filters.minRating}+` : 'Min rating' }}
      </button>
      <button type="button" class="chip" :class="{ on: filters.keys.length > 0 }" @click="sheet = 'key'">
        Key{{ filters.keys.length ? ` (${filters.keys.length})` : '' }}
      </button>
      <button
        type="button"
        class="chip"
        :class="{ on: filters.arrangers.length > 0 }"
        @click="sheet = 'arranger'"
      >
        Arranger{{ filters.arrangers.length ? ` (${filters.arrangers.length})` : '' }}
      </button>
      <button
        v-if="types.length"
        type="button"
        class="chip"
        :class="{ on: filters.types.length > 0 }"
        @click="sheet = 'type'"
      >
        Type{{ filters.types.length ? ` (${filters.types.length})` : '' }}
      </button>
      <button
        v-if="collections.length"
        type="button"
        class="chip"
        :class="{ on: filters.collections.length > 0 }"
        @click="sheet = 'collection'"
      >
        Collection{{ filters.collections.length ? ` (${filters.collections.length})` : '' }}
      </button>
      <button v-if="hasActive" type="button" class="chip clear" @click="$emit('clear')">
        Clear filters
      </button>
    </div>

    <p v-if="ftsPending" class="warn" role="status">
      Full text is on — searching titles until the lyrics index finishes loading.
    </p>

    <div v-if="filters.keys.length || filters.arrangers.length" class="active">
      <button
        v-for="k in filters.keys"
        :key="'k-' + k"
        type="button"
        class="chip on sm"
        @click="removeKey(k)"
      >
        {{ k }} ✕
      </button>
      <button
        v-for="a in filters.arrangers"
        :key="'a-' + a"
        type="button"
        class="chip on sm"
        @click="removeArranger(a)"
      >
        {{ a }} ✕
      </button>
    </div>

    <FilterSheet :open="sheet === 'rating'" title="Minimum rating" @close="sheet = null">
      <div class="opts">
        <button type="button" class="btn" @click="setRating(null)">Any</button>
        <button type="button" class="btn" @click="setRating(3)">★ 3+</button>
        <button type="button" class="btn" @click="setRating(4)">★ 4+</button>
        <button type="button" class="btn" @click="setRating(4.5)">★ 4.5+</button>
      </div>
    </FilterSheet>

    <FilterSheet :open="sheet === 'key'" title="Key" @close="sheet = null">
      <div class="opts wrap">
        <button
          v-for="k in keys"
          :key="k"
          type="button"
          class="chip"
          :class="{ on: filters.keys.includes(k) }"
          @click="toggleKey(k)"
        >
          {{ k }}
        </button>
      </div>
    </FilterSheet>

    <FilterSheet
      :open="sheet === 'arranger'"
      title="Arranger (by last name)"
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

    <FilterSheet :open="sheet === 'type'" title="Type" @close="sheet = null">
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

    <FilterSheet :open="sheet === 'collection'" title="Collection" @close="sheet = null">
      <div class="opts wrap">
        <button
          v-for="c in collections"
          :key="c"
          type="button"
          class="chip"
          :class="{ on: filters.collections.includes(c) }"
          @click="toggleCollection(c)"
        >
          {{ c }}
        </button>
      </div>
    </FilterSheet>
  </div>
</template>

<style scoped>
.chips-wrap {
  display: grid;
  gap: 0.5rem;
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
}
</style>
