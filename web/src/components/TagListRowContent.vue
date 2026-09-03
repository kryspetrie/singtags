<script setup lang="ts">
/**
 * Shared tag title + metadata block for Browse, Favorites, and Recent list rows.
 */
import { computed } from 'vue'
import type { TagSummary } from '../types/tag'
import { bookletBadgeForTag } from '../search/browse'
import { normalizeYear } from '../lib/year'
import { cacheReadyLabel, formatDownloads, visibleAltTitle } from '../lib/tagDisplay'
import { useCatalogStore } from '../stores/catalog'

const props = defineProps<{
  tag: TagSummary
  lyricsSnippet?: string | null
}>()

const catalog = useCatalogStore()

const altTitle = computed(() => visibleAltTitle(props.tag.altTitle, props.tag.title))
const bookletBadge = computed(() => bookletBadgeForTag(props.tag))
const cacheLabel = computed(() => cacheReadyLabel(props.tag.id, catalog.cacheReadyByTag))
</script>

<template>
  <span class="title">
    <span class="title-line">
      <span class="tag-num" title="Tag number">#{{ tag.id }}</span>
      <span
        v-if="bookletBadge"
        class="classic-num"
        :class="'booklet-' + bookletBadge.kind"
        :title="bookletBadge.label"
      >{{ bookletBadge.short }}</span>
      {{ tag.title || `Tag ${tag.id}` }}
    </span>
    <span v-if="altTitle" class="alt-title">{{ altTitle }}</span>
  </span>
  <span class="meta">
    <slot name="extra-meta" />
    <span v-if="tag.key" title="Written key">{{ tag.key }}</span>
    <span v-if="tag.arranger" :title="`Arranger: ${tag.arranger}`">{{ tag.arranger }}</span>
    <span v-if="normalizeYear(tag.year)" title="Year published or added">{{
      normalizeYear(tag.year)
    }}</span>
    <span
      v-if="tag.rating != null"
      :title="`Average rating${tag.ratingCount != null ? ` (${tag.ratingCount} votes)` : ''}`"
    >★ {{ tag.rating.toFixed(2) }}</span>
    <span
      v-if="formatDownloads(tag.downloads)"
      class="dl-count"
      title="Downloads on barbershoptags.com"
    >↓ {{ formatDownloads(tag.downloads) }}</span>
    <span
      v-if="cacheLabel"
      class="badge cache-ready"
      :title="`Cached on this device: ${cacheLabel} (may still need network for a full Mix)`"
    >{{ cacheLabel }}</span>
    <span v-if="!tag.hasSheet" class="badge badge-icon" title="No sheet music on file">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M7 3.5h7.5L19 8v12.5H7z"
        />
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M14.5 3.5V8H19M9.5 12h5M9.5 15.5h5"
        />
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          d="M5 5l14 14"
        />
      </svg>
    </span>
    <span
      v-if="!tag.audioParts?.length"
      class="badge badge-icon"
      title="No learning tracks on file"
      aria-label="No learning tracks on file"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M11 5.5L7 9H4.5v6H7l4 3.5zM15.2 9.8a3.2 3.2 0 010 4.4"
        />
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          d="M5 5l14 14"
        />
      </svg>
    </span>
  </span>
  <span
    v-if="lyricsSnippet"
    class="lyrics-snip"
    title="Lyrics match"
  >{{ lyricsSnippet }}</span>
</template>

<style scoped>
.title {
  font-weight: 600;
}
.title-line {
  min-width: 0;
}
.tag-num {
  display: inline-block;
  margin-right: 0.35rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 0.9em;
}
.classic-num.booklet-days100 {
  color: color-mix(in srgb, var(--accent) 70%, var(--text));
}
.classic-num.booklet-easytags {
  color: color-mix(in srgb, var(--text) 75%, var(--accent));
  border-color: color-mix(in srgb, var(--border) 70%, var(--accent));
  background: color-mix(in srgb, var(--surface) 92%, var(--accent));
}
.classic-num {
  display: inline-block;
  margin-right: 0.4rem;
  padding: 0.05rem 0.4rem;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 0.78em;
  letter-spacing: 0.02em;
  vertical-align: 0.05em;
}
.alt-title {
  display: block;
  color: var(--muted);
  font-weight: 500;
  font-size: 0.88em;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  color: var(--muted);
  font-size: 0.92rem;
}
.dl-count {
  font-variant-numeric: tabular-nums;
}
.badge {
  color: var(--danger);
  font-size: 0.8rem;
}
.badge.cache-ready {
  color: var(--accent);
  font-weight: 600;
}
.badge-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0.9;
}
.badge-icon svg {
  display: block;
}
.lyrics-snip {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--muted);
  font-size: 0.86rem;
  line-height: 1.35;
  font-weight: 400;
  max-width: 42rem;
}
</style>
