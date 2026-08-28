<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import EmptyState from '../components/EmptyState.vue'
import StarsNoticeLine from '../components/StarsNoticeLine.vue'
import { useCatalogStore } from '../stores/catalog'
import { useStarsStore } from '../stores/stars'
import { useRecentStore, type RecentSort } from '../stores/recent'
import type { TagSummary } from '../types/tag'

const catalog = useCatalogStore()
const stars = useStarsStore()
const recent = useRecentStore()
const sort = ref<RecentSort>('recent')

const sorts: Array<{ id: RecentSort; label: string }> = [
  { id: 'recent', label: 'Most recent' },
  { id: 'opens', label: 'Most opens' },
]

const rows = computed(() =>
  recent.sortedRecords(sort.value).map((rec) => ({
    rec,
    tag:
      catalog.getById(rec.id) ??
      stars.records.find((r) => r.tagId === rec.id)?.summary ??
      null,
  })),
)

onMounted(async () => {
  await Promise.all([catalog.load(), stars.ensureLoaded()])
})

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    hour: 'numeric',
    minute: '2-digit',
  })
}

function toggleRowStar(summary: TagSummary): void {
  void stars.toggle(summary, null, { metadataOnly: false })
}

function rowStarTip(tag: TagSummary): string {
  if (stars.isTagCaching(tag.id)) {
    return stars.tagCachingLabel(tag.id) || 'Caching for offline'
  }
  return stars.isStarred(tag.id) ? 'Unstar' : 'Star'
}

function rowStarLabel(tag: TagSummary): string {
  if (stars.isTagCaching(tag.id)) return 'Caching for offline'
  return stars.isStarred(tag.id) ? 'Unstar' : 'Star'
}
</script>

<template>
  <section class="recent-page" aria-label="Recent tags">
    <p class="muted intro">
      Tags you open from Browse. Next/previous on a tag page does not add to this list or increase open counts.
    </p>

    <p v-if="catalog.loading && !catalog.loaded" class="muted intro" role="status">
      Loading catalog…
    </p>

    <div class="toolbar">
      <label class="sort-field">
        <span class="sort-lbl">Sort</span>
        <select v-model="sort" aria-label="Sort recent tags">
          <option v-for="s in sorts" :key="s.id" :value="s.id">{{ s.label }}</option>
        </select>
      </label>
      <button v-if="recent.count" type="button" class="btn btn-ghost" @click="recent.clear()">
        Clear all
      </button>
    </div>

    <p v-if="stars.lastNotice" class="ok stars-notice-wrap" role="status">
      <StarsNoticeLine :notice="stars.lastNotice" />
    </p>
    <p v-if="stars.error" class="warn" role="alert">{{ stars.error }}</p>

    <EmptyState
      v-if="!recent.count"
      title="No recent tags yet"
      message="Open tags from Browse — they will show up here with how often you visit them."
    />
    <ul v-else class="list">
      <li v-for="{ rec, tag } in rows" :key="rec.id" class="list-row">
        <RouterLink
          v-if="tag"
          :to="`/tag/${rec.id}`"
          class="row-link"
        >
          <span class="title">
            <span class="tag-num">#{{ rec.id }}</span>
            {{ tag.title || `Tag ${rec.id}` }}
          </span>
          <span class="meta">
            <span>{{ rec.opens }} open{{ rec.opens === 1 ? '' : 's' }}</span>
            <span>{{ formatWhen(rec.lastOpenedAt) }}</span>
            <span v-if="tag.key">{{ tag.key }}</span>
            <span v-if="tag.arranger">{{ tag.arranger }}</span>
          </span>
        </RouterLink>
        <div v-else-if="catalog.loaded" class="row-link missing">
          <span class="title">#{{ rec.id }}</span>
          <span class="meta muted">Not in catalog</span>
        </div>
        <div v-else class="row-link missing">
          <span class="title">#{{ rec.id }}</span>
          <span class="meta muted">Loading…</span>
        </div>
        <button
          v-if="tag"
          type="button"
          class="row-star"
          :aria-pressed="stars.isStarred(tag.id)"
          :aria-busy="stars.isTagCaching(tag.id)"
          :aria-label="rowStarLabel(tag)"
          :title="rowStarTip(tag)"
          @click.stop="toggleRowStar(tag)"
        >
          <span
            v-if="stars.isTagCaching(tag.id)"
            class="row-star-spinner"
            aria-hidden="true"
          />
          <span v-else>{{ stars.isStarred(tag.id) ? '★' : '☆' }}</span>
        </button>
        <button
          type="button"
          class="row-remove"
          :aria-label="`Remove ${tag?.title || `tag #${rec.id}`} from recent`"
          title="Remove from recent"
          @click.stop="recent.remove(rec.id)"
        >
          ×
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.intro {
  color: var(--muted);
  margin: 0 0 1rem;
  max-width: 36rem;
  line-height: 1.45;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 1rem;
}
.sort-field {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.9rem;
  color: var(--muted);
}
.sort-field select {
  font: inherit;
  min-height: 40px;
  padding: 0.35rem 0.55rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.ok {
  color: var(--accent);
  font-size: 0.9rem;
}
.warn {
  color: var(--danger);
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.35rem;
}
.list-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 0.35rem;
  align-items: center;
  padding: 0.45rem 0.35rem;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid transparent;
}
.list-row:focus-within {
  border-color: var(--border);
}
.list-row:has(.row-star) {
  grid-template-columns: 1fr auto auto;
}
.list-row:not(:has(.row-star)) {
  grid-template-columns: 1fr auto;
}
.row-link {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.55rem 0.35rem;
  color: inherit;
  text-decoration: none;
  min-height: 56px;
  justify-content: center;
  min-width: 0;
}
.row-link:hover {
  text-decoration: none;
  color: var(--accent-hover);
}
.row-link.missing {
  color: var(--muted);
}
.row-star {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  align-self: center;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 1.25rem;
}
.row-remove {
  z-index: 1;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  align-self: center;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
}
.row-remove:hover {
  color: var(--danger, #b42318);
}
.row-star[aria-busy='true'] {
  color: var(--muted);
}
.row-star-spinner {
  display: block;
  width: 1.1rem;
  height: 1.1rem;
  border: 2px solid color-mix(in srgb, var(--accent) 28%, transparent);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: row-star-spin 0.65s linear infinite;
}
@keyframes row-star-spin {
  to {
    transform: rotate(360deg);
  }
}
.title {
  font-weight: 600;
}
.tag-num {
  display: inline-block;
  margin-right: 0.35rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 0.9em;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  color: var(--muted);
  font-size: 0.92rem;
}
</style>
