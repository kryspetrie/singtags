<script setup lang="ts">
/**
 * Shared tag title + metadata block for Browse, Favorites, and Recent list rows.
 */
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue'
import type { TagSummary } from '../types/tag'
import { bookletBadgeForTag } from '../search/browse'
import { normalizeYear } from '../lib/year'
import { cacheReadyLabel, formatDownloads, visibleAltTitle } from '../lib/tagDisplay'
import { NARROW_VIEWPORT_MQ, readIsNarrowViewport } from '../lib/narrowViewport'
import { useCatalogStore } from '../stores/catalog'
import { useRatingsStore } from '../stores/ratings'

const props = defineProps<{
  tag: TagSummary
  lyricsSnippet?: string | null
}>()

const catalog = useCatalogStore()
const ratings = useRatingsStore()

const altTitle = computed(() => visibleAltTitle(props.tag.altTitle, props.tag.title))
const bookletBadge = computed(() => bookletBadgeForTag(props.tag))
const cacheLabel = computed(() => cacheReadyLabel(props.tag.id, catalog.cacheReadyByTag))
const myRating = computed(() => {
  void ratings.revision
  return ratings.starsFor(props.tag.id)
})
/** Mobile: badge rides the subtitle when one exists; otherwise leads the meta row. */
const badgeOnMeta = computed(() => !!bookletBadge.value && !altTitle.value)

/**
 * Mobile: lyrics stay on their own line unless key→icons meta already wraps
 * onto a second line; then lyrics continue on that wrap line after the chips.
 */
const metaBlockEl = ref<HTMLElement | null>(null)
const isNarrow = ref(readIsNarrowViewport())
const packLyricsAfterMetaWrap = ref(false)
let narrowMq: MediaQueryList | null = null
let metaRo: ResizeObserver | null = null
let packSyncing = false
let packTimer = 0

/** Key / arranger / year / rating / downloads / cache / sheet+audio icons only. */
const META_DETAIL_SEL = '.meta-item'
/**
 * Baseline-aligned chips on one flex line can differ by a few px in offsetTop.
 * A real wrap is ~one line (≥ ~0.92rem); require a clear gap.
 */
const META_WRAP_TOP_EPS_PX = 10

function metaDetailsWrapToSecondLine(): boolean {
  const root = metaBlockEl.value
  if (!root) return false
  const chips = root.querySelectorAll<HTMLElement>(META_DETAIL_SEL)
  if (chips.length < 2) return false
  let minTop = Infinity
  let maxTop = -Infinity
  for (const chip of chips) {
    const top = chip.offsetTop
    if (top < minTop) minTop = top
    if (top > maxTop) maxTop = top
  }
  return maxTop - minTop >= META_WRAP_TOP_EPS_PX
}

/** Apply pack only after measuring with lyrics on its own line (flex-basis 100%). */
function syncLyricsPack(): void {
  if (packSyncing) return
  if (!isNarrow.value || props.lyricsSnippet === undefined) {
    packLyricsAfterMetaWrap.value = false
    return
  }
  packSyncing = true
  const apply = (): void => {
    const wrap = metaDetailsWrapToSecondLine()
    packLyricsAfterMetaWrap.value = wrap
    void nextTick(() => {
      packSyncing = false
    })
  }
  if (packLyricsAfterMetaWrap.value) {
    // Unpack first so chip wrap isn’t affected by lyrics on the same line.
    packLyricsAfterMetaWrap.value = false
    void nextTick(apply)
  } else {
    apply()
  }
}

function scheduleSyncLyricsPack(): void {
  if (typeof window === 'undefined') return
  window.clearTimeout(packTimer)
  packTimer = window.setTimeout(() => {
    packTimer = 0
    syncLyricsPack()
  }, 32)
}

function syncNarrow(): void {
  isNarrow.value = narrowMq?.matches ?? readIsNarrowViewport()
  scheduleSyncLyricsPack()
}

onMounted(() => {
  if (typeof window === 'undefined') return
  narrowMq = window.matchMedia(NARROW_VIEWPORT_MQ)
  narrowMq.addEventListener('change', syncNarrow)
  if (typeof ResizeObserver !== 'undefined') {
    metaRo = new ResizeObserver(() => {
      if (!packSyncing) scheduleSyncLyricsPack()
    })
    if (metaBlockEl.value) metaRo.observe(metaBlockEl.value)
  }
  scheduleSyncLyricsPack()
})

onUnmounted(() => {
  narrowMq?.removeEventListener('change', syncNarrow)
  narrowMq = null
  metaRo?.disconnect()
  metaRo = null
  if (packTimer) window.clearTimeout(packTimer)
})

watch(
  () =>
    [
      props.tag.id,
      props.tag.key,
      props.tag.arranger,
      props.tag.year,
      props.tag.rating,
      props.tag.downloads,
      props.tag.hasSheet,
      props.tag.audioParts?.length,
      cacheLabel.value,
      badgeOnMeta.value,
      props.lyricsSnippet !== undefined,
    ] as const,
  () => {
    void nextTick(() => scheduleSyncLyricsPack())
  },
)

watch(metaBlockEl, (el, prev) => {
  if (prev) metaRo?.unobserve(prev)
  if (el) {
    metaRo?.observe(el)
    scheduleSyncLyricsPack()
  }
})
</script>

<template>
  <span class="title">
    <span class="title-line">
      <span class="tag-num" title="Tag number">#{{ tag.id }}</span>
      <!-- Desktop: badge on the title line. Mobile: subtitle or meta (see below). -->
      <span
        v-if="bookletBadge"
        class="classic-num classic-num-title"
        :class="'booklet-' + bookletBadge.kind"
        :title="bookletBadge.label"
      >{{ bookletBadge.short }}</span>
      <span class="title-text">{{ tag.title || `Tag ${tag.id}` }}</span>
      <span
        v-if="myRating != null"
        class="my-rating-meta"
        :title="`My rating: ${myRating} of 5`"
        :aria-label="`My rating: ${myRating} of 5`"
      >{{ '★'.repeat(myRating) }}</span>
    </span>
    <!--
      Only render when there is a real alt title — no empty reserved line.
      On mobile the collection badge leads this line so the title stays clear.
    -->
    <span v-if="altTitle" class="alt-title ready">
      <span
        v-if="bookletBadge"
        class="classic-num classic-num-sub"
        :class="'booklet-' + bookletBadge.kind"
        :title="bookletBadge.label"
      >{{ bookletBadge.short }}</span>
      <span class="alt-title-text">{{ altTitle }}</span>
    </span>
  </span>
  <!--
    Mobile: meta chips + lyrics share one flex wrap. Lyrics default to their own
    line; if chips already wrap, lyrics continue on that wrap line.
  -->
  <span ref="metaBlockEl" class="meta-block">
    <span class="meta">
      <!-- Mobile, no subtitle: badge shares the meta line when width allows. -->
      <span
        v-if="badgeOnMeta && bookletBadge"
        class="classic-num classic-num-meta"
        :class="'booklet-' + bookletBadge.kind"
        :title="bookletBadge.label"
      >{{ bookletBadge.short }}</span>
      <slot name="extra-meta" />
      <span v-if="tag.key" class="meta-item meta-key" title="Written key">{{ tag.key }}</span>
      <span
        v-if="tag.arranger"
        class="meta-item meta-arranger"
        :title="`Arranger: ${tag.arranger}`"
      >{{ tag.arranger }}</span>
      <span
        v-if="normalizeYear(tag.year)"
        class="meta-item meta-year"
        title="Year published or added"
      >{{ normalizeYear(tag.year) }}</span>
      <span
        v-if="tag.rating != null"
        class="meta-item meta-rating"
        :title="`Average rating${tag.ratingCount != null ? ` (${tag.ratingCount} votes)` : ''}`"
      >★ {{ tag.rating.toFixed(2) }}</span>
      <span
        v-if="formatDownloads(tag.downloads)"
        class="meta-item meta-dl dl-count"
        title="Downloads on barbershoptags.com"
      >↓ {{ formatDownloads(tag.downloads) }}</span>
      <span
        v-if="cacheLabel"
        class="meta-item badge cache-ready"
        :title="`Cached on this device: ${cacheLabel} (may still need network for a full Mix)`"
      >{{ cacheLabel }}</span>
      <span v-if="!tag.hasSheet" class="meta-item badge badge-icon" title="No sheet music on file">
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
        class="meta-item badge badge-icon"
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
    <!--
      Browse/Roulette pass lyricsSnippet (string|null): always reserve one line
      (nbsp + min-height) so late lyrics hydrate fades in without resizing cards.
    -->
    <span
      v-if="lyricsSnippet !== undefined"
      class="lyrics-snip"
      :class="{ ready: !!lyricsSnippet, 'after-meta-wrap': packLyricsAfterMetaWrap }"
      :title="lyricsSnippet ? 'Lyrics' : undefined"
      :aria-hidden="lyricsSnippet ? undefined : true"
    >{{ lyricsSnippet || '\u00a0' }}</span>
  </span>
</template>

<style scoped>
.title {
  font-weight: 600;
  min-width: 0;
}
.title-line {
  min-width: 0;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.35rem 0.45rem;
}
.title-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag-num {
  display: inline-block;
  margin-right: 0.35rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 0.9em;
  flex: 0 0 auto;
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
  flex: 0 0 auto;
}
.classic-num-sub,
.classic-num-meta {
  display: none;
}
.alt-title {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  color: var(--muted);
  font-weight: 500;
  font-size: 0.88em;
  line-height: 1.35;
  overflow: hidden;
}
.alt-title-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta-block {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  color: var(--muted);
  font-size: 0.92rem;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: flex-start;
  column-gap: 0.65rem;
  row-gap: 0.15rem;
  min-width: 0;
}
.meta-item {
  flex: 0 0 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta-arranger {
  /* Shrink/ellipsis the name so later fields (year, Sheets+tracks) stay on the line. */
  flex: 0 1 auto;
  min-width: 3rem;
  max-width: 100%;
}
.meta-key,
.meta-year,
.meta-rating,
.meta-dl,
.badge.cache-ready,
.badge-icon {
  flex: 0 0 auto;
}
.dl-count {
  font-variant-numeric: tabular-nums;
}
.my-rating-meta {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  color: var(--accent);
  font-weight: 650;
  font-size: 0.88rem;
  line-height: 1;
  letter-spacing: 0.04em;
  padding: 0.2rem 0.45rem;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
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
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: 0.86rem;
  line-height: 1.35;
  /* Reserved one-line box so late lyrics hydrate fades in without a jump. */
  min-height: calc(0.86rem * 1.35);
  font-weight: 400;
  max-width: 42rem;
  opacity: 0;
  transition: opacity 0.35s ease;
}
.lyrics-snip.ready {
  opacity: 1;
}
@media (max-width: 639px) {
  .classic-num-title {
    display: none;
  }
  .classic-num-sub,
  .classic-num-meta {
    display: inline-block;
    margin-right: 0;
  }
  .meta-block {
    display: flex;
    flex-flow: row wrap;
    align-items: baseline;
    gap: 0.15rem 0.65rem;
  }
  .meta {
    display: contents;
  }
  /*
   * Default: own line (flex-basis 100%). Only `.after-meta-wrap` — when the
   * detail chips already occupy two lines — continues after those chips.
   */
  .lyrics-snip {
    flex: 1 1 100%;
    min-width: 0;
    max-width: 100%;
  }
  .lyrics-snip.after-meta-wrap {
    flex: 1 1 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .lyrics-snip {
    transition: none;
  }
}
</style>
