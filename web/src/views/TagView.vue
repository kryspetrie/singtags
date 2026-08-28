<script setup lang="ts">
import { bookletBadgeForTag, collectionLabel } from '../search/browse'
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useCatalogStore } from '../stores/catalog'
import { useQueueStore } from '../stores/queue'
import { useStarsStore } from '../stores/stars'
import { useRecentStore } from '../stores/recent'
import { usePracticeStore } from '../stores/practice'
import { downloadableSheetAssets } from '../lib/sheetAssets'
import { catalogOriginalPaths } from '../lib/audioTiers'
import { downloadFormatLabel } from '../types/audio'
import type { QueueTrack } from '../download/zip'
import { PitchPlayer, formatKeyShiftLabel, keyToTonicNote, transposeKeyLabel, clampPitchSemitones, MIN_PITCH_SEMITONES, MAX_PITCH_SEMITONES } from '../audio/pitchPlayer'
import SheetViewer from '../components/SheetViewer.vue'
import TagPlayer from '../components/TagPlayer.vue'
import TagDownloads from '../components/TagDownloads.vue'
import StarsNoticeLine from '../components/StarsNoticeLine.vue'
import EmptyState from '../components/EmptyState.vue'
import type { AudioTransform } from '../types/audio'
import { useOnline } from '../composables/useOnline'
import { useTagDetail } from '../composables/useTagDetail'
import { buildTagDetailRows } from '../lib/tagDetailMeta'
import { visibleAltTitle } from '../lib/tagDisplay'
import { barbershopTagsTagUrl } from '../lib/barbershopTags'

const props = defineProps<{ id: string }>()
const catalog = useCatalogStore()
const queue = useQueueStore()
const stars = useStarsStore()
const recent = useRecentStore()
const practice = usePracticeStore()
const route = useRoute()
const router = useRouter()
const { offline } = useOnline()
const idRef = toRef(props, 'id')
const {
  detail,
  error,
  fromCache,
  audioParts,
  availableAudioParts,
  hasPackAudio,
  sheetAssets,
  preparedSheet,
  loading,
  sheetPreparing,
  mediaSource,
  load,
  resolvePart,
  toSummary,
} = useTagDetail(idRef)

const keyShift = ref(0)
const pitch = new PitchPlayer()
const playerTransform = ref<AudioTransform>({ pitchSemitones: 0, speed: 1 })
const queueMsg = ref<string | null>(null)
const syncingShift = ref(false)
const practiceDone = ref(false)

const inPractice = computed(() => route.query.set === 'practice')

function readShiftFromRoute(): number {
  const raw = route.query.shift
  if (typeof raw !== 'string' || raw === '') return 0
  const n = Number(raw)
  return Number.isFinite(n) ? clampPitchSemitones(n) : 0
}

function bumpKeyShift(delta: number): void {
  keyShift.value = clampPitchSemitones(keyShift.value + delta)
}

onMounted(async () => {
  await catalog.load()
  await stars.ensureLoaded()
  keyShift.value = readShiftFromRoute()
  await load()
  if (recent.consumeBrowseNavigation(Number(props.id))) {
    recent.recordOpen(Number(props.id))
  }
})

onUnmounted(() => {
  pitch.dispose()
  if (copyUrlTimer) clearTimeout(copyUrlTimer)
})

watch(
  () => props.id,
  async () => {
    keyShift.value = readShiftFromRoute()
    practiceDone.value = false
    await load()
    if (recent.consumeBrowseNavigation(Number(props.id))) {
      recent.recordOpen(Number(props.id))
    }
  },
)

watch(
  () => route.query.shift,
  () => {
    const n = readShiftFromRoute()
    if (n !== keyShift.value) {
      syncingShift.value = true
      keyShift.value = n
      queueMicrotask(() => {
        syncingShift.value = false
      })
    }
  },
)

watch(keyShift, (v) => {
  const c = clampPitchSemitones(v)
  if (c !== v) {
    keyShift.value = c
    return
  }
  playerTransform.value = { ...playerTransform.value, pitchSemitones: c }
  if (syncingShift.value) return
  const q = { ...route.query } as Record<string, string | string[] | undefined>
  if (c) q.shift = String(c)
  else delete q.shift
  void router.replace({ query: q })
})

watch(playerTransform, (t) => {
  const c = clampPitchSemitones(t.pitchSemitones)
  if (c !== keyShift.value) keyShift.value = c
  queue.setPlaybackTransform({ ...t, pitchSemitones: c })
}, { deep: true })

/** When connectivity returns, retry loading sheets/audio for this tag. */
watch(offline, (now, prev) => {
  if (prev === true && now === false) void load()
})

const summary = computed(() => catalog.getById(Number(props.id)) ?? toSummary())
const starred = computed(() => stars.ids.has(Number(props.id)))
const hasAudio = computed(
  () => availableAudioParts.value.length > 0 || Object.keys(audioParts.value).length > 0,
)
const hasOfflinePlayback = computed(
  () =>
    Object.keys(audioParts.value).length > 0 ||
    hasPackAudio.value ||
    (offline.value && availableAudioParts.value.length > 0),
)
const showUpdate = computed(() => starred.value && !offline.value)
const nav = computed(() =>
  inPractice.value
    ? practice.neighbors(Number(props.id))
    : catalog.neighbors(Number(props.id)),
)
const keyDisplay = computed(() => detail.value?.key || detail.value?.writ_key || summary.value?.key || null)

const pitchLabel = computed(() => formatKeyShiftLabel(keyDisplay.value, keyShift.value))
const canPayKey = computed(() => !!tonicNote())

const partialUnavailable = computed(
  () => !loading.value && !detail.value && !!summary.value,
)
const downloadBlockedReason = computed(() =>
  !offline.value && fromCache.value
    ? 'Download needs network paths — open this tag online once.'
    : null,
)

const queueBlockedReason = computed(() => {
  const d = detail.value
  if (!d) return 'Tag details unavailable.'
  const hasSheets = downloadableSheetAssets(d).length > 0
  const hasTracks = Object.keys(catalogOriginalPaths(d)).length > 0
  if (!hasSheets && !hasTracks) return 'No downloadable files on this tag.'
  return null
})

const detailMetaRows = computed(() => (detail.value ? buildTagDetailRows(detail.value) : []))

const pageTitle = computed(() => detail.value?.title ?? summary.value?.title ?? null)
const pageTitleDisplay = computed(() => pageTitle.value || `Tag ${props.id}`)
const pageAltTitle = computed(() =>
  visibleAltTitle(detail.value?.alt_title ?? summary.value?.altTitle, pageTitle.value),
)
const pageTitleTooltip = computed(() =>
  pageAltTitle.value ? `${pageTitleDisplay.value} — ${pageAltTitle.value}` : pageTitleDisplay.value,
)
const sharePageUrl = computed(() => {
  const resolved = router.resolve({ path: `/tag/${props.id}` })
  if (typeof window !== 'undefined') {
    return new URL(resolved.href, window.location.origin).href
  }
  return resolved.href
})
const barbershopPageUrl = computed(() =>
  barbershopTagsTagUrl(Number(props.id), pageTitle.value),
)
const copyUrlMsg = ref<string | null>(null)
let copyUrlTimer: ReturnType<typeof setTimeout> | null = null

async function copyShareUrl(): Promise<void> {
  copyUrlMsg.value = null
  try {
    await navigator.clipboard.writeText(sharePageUrl.value)
    copyUrlMsg.value = 'Copied'
  } catch {
    copyUrlMsg.value = 'Copy failed'
  }
  if (copyUrlTimer) clearTimeout(copyUrlTimer)
  copyUrlTimer = setTimeout(() => {
    copyUrlMsg.value = null
  }, 2000)
}

function tagLink(id: number): Record<string, unknown> {
  const q = { ...route.query } as Record<string, string | string[] | undefined>
  if (inPractice.value) q.set = 'practice'
  return { path: `/tag/${id}`, query: q }
}

function exitPractice(): void {
  const q = { ...route.query } as Record<string, string | string[] | undefined>
  delete q.set
  void router.replace({ path: route.path, query: q })
}

function onTrackEnded(): void {
  if (!inPractice.value || !practice.autoAdvance) return
  const next = practice.neighbors(Number(props.id)).next
  if (next != null) {
    practiceDone.value = false
    void router.push(tagLink(next) as { path: string; query: Record<string, string | string[] | undefined> })
  } else {
    practiceDone.value = true
  }
}

/** Catalog key when present; otherwise the key chosen via ± (from C). */
function effectiveKeyLabel(): string | null {
  const catalog =
    detail.value?.writ_key ||
    detail.value?.key ||
    summary.value?.writKey ||
    summary.value?.key ||
    null
  if (catalog) return catalog
  if (!keyShift.value) return null
  return transposeKeyLabel('C Major', keyShift.value)
}

function tonicNote(): string | null {
  return keyToTonicNote(effectiveKeyLabel())
}

async function payKeyDown(): Promise<void> {
  const note = tonicNote()
  if (!note) return
  // With catalog key, ± detunes the written tonic. Without, ± already picked the absolute key.
  const detuneCents = keyDisplay.value ? keyShift.value * 100 : 0
  await pitch.start(note, detuneCents)
}

function payKeyUp(): void {
  pitch.stop(true)
}

function onPayKey(e: KeyboardEvent): void {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    if (e.type === 'keydown') void payKeyDown()
    else payKeyUp()
  }
}

function addItemsToQueue(items: QueueTrack[]): void {
  const d = detail.value
  if (!d || queueBlockedReason.value || !items.length) return
  queue.addMany(items)
  const sheets = items.filter((i) => i.kind === 'sheet').length
  const tracks = items.length - sheets
  const bits: string[] = []
  if (sheets) bits.push(`${sheets} sheet file${sheets === 1 ? '' : 's'}`)
  if (tracks) {
    const fmt = items.find((i) => i.kind !== 'sheet')?.format
    bits.push(
      `${tracks} track${tracks === 1 ? '' : 's'}${fmt ? ` as ${downloadFormatLabel(fmt)}` : ''}`,
    )
  }
  queueMsg.value = `Added ${bits.join(' and ')} to downloads.`
}

function onToggleStar(): void {
  if (!summary.value) return
  void stars.toggle(summary.value, detail.value, { metadataOnly: false })
}

async function onRefreshMedia(): Promise<void> {
  await stars.updateOfflineMedia(Number(props.id), detail.value)
  await load()
}

async function onCacheUpgraded(): Promise<void> {
  await load()
}

async function onRetryLoad(): Promise<void> {
  await load()
}
</script>

<template>
  <p
    v-if="(loading && !detail) || (catalog.loading && !detail && !summary)"
    class="tag-loading"
    role="status"
    aria-live="polite"
  >
    Loading…
  </p>
  <section v-else-if="detail" class="tag">
    <div class="toprow">
      <div class="toprow-start">
        <RouterLink
          v-if="inPractice"
          class="btn page-back"
          to="/starred"
          title="Back to practice set"
        >← Practice set</RouterLink>
        <RouterLink v-else class="btn page-back" to="/" title="Back to browse">← Back</RouterLink>
      </div>
      <nav
        v-if="nav.total > 1 && nav.index >= 0"
        class="pager toprow-center"
        aria-label="Result navigation"
      >
        <RouterLink
          v-if="nav.prev != null"
          class="btn"
          :to="tagLink(nav.prev)"
          title="Previous tag in this list"
        >
          <span class="pager-full">← Prev</span>
          <span class="pager-short" aria-hidden="true">←</span>
        </RouterLink>
        <span v-else class="btn disabled" aria-disabled="true" title="No previous tag">
          <span class="pager-full">← Prev</span>
          <span class="pager-short" aria-hidden="true">←</span>
        </span>
        <span class="pos" :title="`${nav.index + 1} of ${nav.total} in current list`">{{ nav.index + 1 }} / {{ nav.total }}</span>
        <RouterLink
          v-if="nav.next != null"
          class="btn"
          :to="tagLink(nav.next)"
          title="Next tag in this list"
        >
          <span class="pager-full">Next →</span>
          <span class="pager-short" aria-hidden="true">→</span>
        </RouterLink>
        <span v-else class="btn disabled" aria-disabled="true" title="No next tag">
          <span class="pager-full">Next →</span>
          <span class="pager-short" aria-hidden="true">→</span>
        </span>
      </nav>
      <div class="toprow-end">
        <button
          v-if="showUpdate"
          type="button"
          class="btn update-btn"
          :disabled="stars.busy"
          aria-label="Update offline media for this starred tag"
          title="Re-download sheet and audio for this starred tag"
          @click="onRefreshMedia"
        >
          {{ stars.busy ? 'Updating…' : 'Update' }}
        </button>
        <button
          type="button"
          class="star"
          :aria-pressed="starred"
          :title="starred ? 'Unstar — remove from saved tags' : 'Star — save for offline use and practice sets'"
          @click="onToggleStar"
        >
          {{ starred ? '★ Starred' : '☆ Star' }}
        </button>
      </div>
    </div>

    <div v-if="inPractice" class="practice-banner" role="status">
      <div class="practice-row">
        <strong>Practice set</strong>
        <span v-if="nav.index >= 0">{{ nav.index + 1 }} / {{ nav.total }}</span>
        <button
          type="button"
          class="toggle-btn"
          :class="{ on: practice.autoAdvance }"
          :aria-pressed="practice.autoAdvance"
          @click="practice.autoAdvance = !practice.autoAdvance"
        >
          Auto-advance
        </button>
        <button type="button" class="btn btn-ghost" @click="exitPractice">Exit</button>
      </div>
      <p v-if="practiceDone" class="ok">End of set — nice work.</p>
    </div>

    <header class="title-row">
      <div class="title-block">
        <div class="title-head">
          <h1 :title="pageTitleTooltip">{{ pageTitleDisplay }}</h1>
          <div class="title-actions">
            <button
              type="button"
              class="title-copy"
              :class="{ ok: copyUrlMsg === 'Copied' }"
              :aria-label="copyUrlMsg || 'Copy link to this tag'"
              :title="copyUrlMsg || 'Copy link to share this tag'"
              @click="copyShareUrl"
            >
              {{ copyUrlMsg || 'Copy URL' }}
            </button>
            <a
              :href="barbershopPageUrl"
              class="title-ext"
              target="_blank"
              rel="noopener noreferrer"
              title="Open on barbershoptags.com"
              aria-label="Open on barbershoptags.com"
            >↗</a>
          </div>
        </div>
        <p v-if="pageAltTitle" class="alt-title">{{ pageAltTitle }}</p>
      </div>
      <p class="id-line">
        <span class="tag-num">Tag #{{ detail.tag_id }}</span>
        <span
          v-if="bookletBadgeForTag(detail)"
          class="classic-num"
          :class="'booklet-' + bookletBadgeForTag(detail)!.kind"
          >{{ bookletBadgeForTag(detail)!.short }}</span
        >
        <span v-if="detail.arranger" class="arranger">{{ detail.arranger }}</span>
      </p>
    </header>
    <p v-if="fromCache && mediaSource === 'star' && !offline" class="warn" role="status">
      Loaded from starred offline cache.
    </p>
    <p
      v-if="offline && detail && hasAudio && !hasOfflinePlayback && !starred"
      class="warn"
      role="status"
    >
      Learning tracks for this tag aren’t cached yet. Download the audio library in
      <RouterLink to="/settings">Offline settings</RouterLink>, or star this tag while online.
    </p>
    <p
      v-else-if="offline && detail && hasAudio && !hasOfflinePlayback && starred"
      class="warn"
      role="status"
    >
      No audio cached for this starred tag. We’ll retry caching when you’re back online, or tap
      <strong>Update</strong> /
      <RouterLink to="/settings">Offline settings</RouterLink>.
    </p>
    <div v-if="stars.progress" class="progress" role="status" aria-live="polite">
      <div class="bar" :style="{ width: `${Math.round(stars.progress.ratio * 100)}%` }" />
      <span>{{ stars.progress.label }}</span>
    </div>
    <p v-if="stars.lastNotice" class="ok stars-notice-wrap" role="status">
      <StarsNoticeLine :notice="stars.lastNotice" />
    </p>

    <section class="section pitch-section" aria-labelledby="pitch-heading">
      <h2 id="pitch-heading" class="section-heading">Pitch</h2>
      <div class="section-body">
        <div class="keyrow">
          <div class="pay" role="group" aria-label="Pitch">
            <button
              type="button"
              class="paybtn"
              :disabled="!canPayKey"
              :aria-label="`Pitch ${pitchLabel} — hold to hear tonic`"
              @pointerdown.prevent="payKeyDown"
              @pointerup.prevent="payKeyUp"
              @pointerleave.prevent="payKeyUp"
              @pointercancel.prevent="payKeyUp"
              @keydown="onPayKey"
              @keyup="onPayKey"
            >
              <span class="pay-kicker">Pitch</span>
              <strong>{{ pitchLabel }}</strong>
            </button>
            <button type="button" aria-label="Lower pitch one semitone" :disabled="keyShift <= MIN_PITCH_SEMITONES" @click="bumpKeyShift(-1)">−</button>
            <button type="button" aria-label="Raise pitch one semitone" :disabled="keyShift >= MAX_PITCH_SEMITONES" @click="bumpKeyShift(1)">+</button>
            <button type="button" :disabled="!keyShift" @click="keyShift = 0">Reset</button>
          </div>
        </div>
        <p class="text-muted tip">
          <template v-if="keyDisplay">Hold Pitch to hear the tonic. ± shifts the player and sheet control together (saved in the URL).</template>
          <template v-else>No written key on file — use ± to choose a key, then hold Pitch to hear that tonic. Pitch shift still applies to playback (saved in the URL).</template>
        </p>
      </div>
    </section>

    <p v-if="sheetPreparing" class="tag-loading below-pitch" role="status" aria-live="polite">
      Preparing sheet…
    </p>
    <template v-else>
    <details class="section" open>
      <summary class="section-summary">Sheet music</summary>
      <div class="section-body">
        <SheetViewer
          v-if="sheetAssets.imageSets.length || sheetAssets.pdfs.length"
          :image-sets="sheetAssets.imageSets"
          :pdfs="offline ? [] : sheetAssets.pdfs"
          :can-choose-format="!offline && sheetAssets.canChooseFormat"
          :prefetched-pages="preparedSheet?.pages ?? null"
          :pay-key-enabled="canPayKey"
          :key-label="pitchLabel"
          :shift="keyShift"
          @pay-down="payKeyDown"
          @pay-up="payKeyUp"
        />
        <p v-else class="text-muted tip">No sheet music on this tag.</p>
      </div>
    </details>

    <details class="section" open>
      <summary class="section-summary">Tracks</summary>
      <div class="section-body">
        <TagPlayer
          v-if="hasAudio"
          :key="id"
          :parts="audioParts"
          :available-parts="availableAudioParts"
          :resolve-part="resolvePart"
          :pending="false"
          :title="detail.title || undefined"
          :pitch-semitones="keyShift"
          :song-key="keyDisplay || undefined"
          :audio-layout-summary="detail.audio_layout_summary"
          :audio-layouts="detail.audio_layouts"
          @transform="playerTransform = $event"
          @update:pitch-semitones="keyShift = $event"
          @ended="onTrackEnded"
        />
        <EmptyState
          v-else-if="!hasAudio"
          title="No audio available"
          :message="
            offline
              ? 'This tag has no learning tracks in the catalog, or none are cached on this device.'
              : 'This tag has no learning tracks cached or on the server.'
          "
        />
      </div>
    </details>

    <TagDownloads
      :detail="detail"
      :offline="offline"
      :download-blocked-reason="downloadBlockedReason"
      :queue-blocked-reason="queueBlockedReason"
      :queue-message="queueMsg"
      @add-to-queue="addItemsToQueue"
      @cache-upgraded="onCacheUpgraded"
    />

    <details v-if="detailMetaRows.length" class="section meta">
      <summary class="section-summary">Details</summary>
      <div class="section-body">
        <dl class="meta-grid">
          <template v-for="row in detailMetaRows" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd :class="{ multiline: row.multiline }">
              <a
                v-if="row.href"
                :href="row.href"
                target="_blank"
                rel="noopener noreferrer"
              >{{ row.value }}</a>
              <template v-else>{{ row.value }}</template>
            </dd>
          </template>
        </dl>
      </div>
    </details>
    </template>
  </section>
  <section v-else-if="partialUnavailable && summary" class="tag tag-partial" aria-live="polite">
    <div class="toprow">
      <div class="toprow-start">
        <RouterLink
          v-if="inPractice"
          class="btn page-back"
          to="/starred"
          title="Back to practice set"
        >← Practice set</RouterLink>
        <RouterLink v-else class="btn page-back" to="/" title="Back to browse">← Back</RouterLink>
      </div>
      <nav
        v-if="nav.total > 1 && nav.index >= 0"
        class="pager toprow-center"
        aria-label="Result navigation"
      >
        <RouterLink
          v-if="nav.prev != null"
          class="btn"
          :to="tagLink(nav.prev)"
          title="Previous tag in this list"
        >
          <span class="pager-full">← Prev</span>
          <span class="pager-short" aria-hidden="true">←</span>
        </RouterLink>
        <span v-else class="btn disabled" aria-disabled="true" title="No previous tag">
          <span class="pager-full">← Prev</span>
          <span class="pager-short" aria-hidden="true">←</span>
        </span>
        <span class="pos" :title="`${nav.index + 1} of ${nav.total} in current list`">{{ nav.index + 1 }} / {{ nav.total }}</span>
        <RouterLink
          v-if="nav.next != null"
          class="btn"
          :to="tagLink(nav.next)"
          title="Next tag in this list"
        >
          <span class="pager-full">Next →</span>
          <span class="pager-short" aria-hidden="true">→</span>
        </RouterLink>
        <span v-else class="btn disabled" aria-disabled="true" title="No next tag">
          <span class="pager-full">Next →</span>
          <span class="pager-short" aria-hidden="true">→</span>
        </span>
      </nav>
      <div class="toprow-end">
        <button
          v-if="showUpdate"
          type="button"
          class="btn update-btn"
          :disabled="stars.busy"
          aria-label="Update offline media for this starred tag"
          title="Re-download sheet and audio for this starred tag"
          @click="onRefreshMedia"
        >
          {{ stars.busy ? 'Updating…' : 'Update' }}
        </button>
        <button
          type="button"
          class="star"
          :aria-pressed="starred"
          :title="starred ? 'Unstar — remove from saved tags' : 'Star — save for offline use and practice sets'"
          @click="onToggleStar"
        >
          {{ starred ? '★ Starred' : '☆ Star' }}
        </button>
      </div>
    </div>

    <header class="title-row">
      <div class="title-block">
        <div class="title-head">
          <h1 :title="pageTitleTooltip">{{ pageTitleDisplay }}</h1>
          <div class="title-actions">
            <button
              type="button"
              class="title-copy"
              :class="{ ok: copyUrlMsg === 'Copied' }"
              :aria-label="copyUrlMsg || 'Copy link to this tag'"
              :title="copyUrlMsg || 'Copy link to share this tag'"
              @click="copyShareUrl"
            >
              {{ copyUrlMsg || 'Copy URL' }}
            </button>
            <a
              :href="barbershopPageUrl"
              class="title-ext"
              target="_blank"
              rel="noopener noreferrer"
              title="Open on barbershoptags.com"
              aria-label="Open on barbershoptags.com"
            >↗</a>
          </div>
        </div>
        <p v-if="pageAltTitle" class="alt-title">{{ pageAltTitle }}</p>
      </div>
      <p class="id-line">
        <span class="tag-num">Tag #{{ summary.id }}</span>
        <span
          v-if="bookletBadgeForTag(summary)"
          class="classic-num"
          :class="'booklet-' + bookletBadgeForTag(summary)!.kind"
          >{{ bookletBadgeForTag(summary)!.short }}</span
        >
        <span v-if="summary.arranger" class="arranger">{{ summary.arranger }}</span>
      </p>
    </header>

    <dl class="partial-meta">
      <div v-if="summary.key">
        <dt>Key</dt>
        <dd>{{ summary.key }}</dd>
      </div>
      <div v-if="summary.type">
        <dt>Type</dt>
        <dd>{{ summary.type }}</dd>
      </div>
      <div v-if="summary.collection">
        <dt>Collection</dt>
        <dd>{{ collectionLabel(summary.collection) || summary.collection }}</dd>
      </div>
      <div v-if="summary.year != null">
        <dt>Year</dt>
        <dd>{{ summary.year }}</dd>
      </div>
      <div v-if="summary.audioParts?.length">
        <dt>Parts</dt>
        <dd>{{ summary.audioParts.join(', ') }}</dd>
      </div>
    </dl>

    <section class="section pitch-section" aria-labelledby="partial-pitch-heading">
      <h2 id="partial-pitch-heading" class="section-heading">Pitch</h2>
      <div class="section-body">
        <div class="keyrow">
          <div class="pay" role="group" aria-label="Pitch">
            <button
              type="button"
              class="paybtn"
              :disabled="!canPayKey"
              :aria-label="`Pitch ${pitchLabel} — hold to hear tonic`"
              @pointerdown.prevent="payKeyDown"
              @pointerup.prevent="payKeyUp"
              @pointerleave.prevent="payKeyUp"
              @pointercancel.prevent="payKeyUp"
              @keydown="onPayKey"
              @keyup="onPayKey"
            >
              <span class="pay-kicker">Pitch</span>
              <strong>{{ pitchLabel }}</strong>
            </button>
            <button type="button" aria-label="Lower pitch one semitone" :disabled="keyShift <= MIN_PITCH_SEMITONES" @click="bumpKeyShift(-1)">−</button>
            <button type="button" aria-label="Raise pitch one semitone" :disabled="keyShift >= MAX_PITCH_SEMITONES" @click="bumpKeyShift(1)">+</button>
            <button type="button" :disabled="!keyShift" @click="keyShift = 0">Reset</button>
          </div>
        </div>
        <p class="text-muted tip">
          <template v-if="keyDisplay"
            >Hold Pitch to hear the tonic. ± shifts the key (saved in the URL).</template
          >
          <template v-else
            >No written key on file — use ± to choose a key, then hold Pitch to hear that
            tonic.</template
          >
        </p>
      </div>
    </section>

    <EmptyState
      :title="offline ? 'Sheets and audio not on this device' : 'Could not load full tag'"
      :message="
        offline
          ? 'Catalog info is shown from memory. Connect to the network to load sheets and tracks — or download the songbook / star this tag while online.'
          : error || 'Retry when you have a connection, or open Offline settings to cache the library.'
      "
      tone="danger"
    >
      <div class="partial-actions">
        <button type="button" class="btn" :disabled="loading" @click="onRetryLoad">
          {{ loading ? 'Retrying…' : 'Retry' }}
        </button>
        <RouterLink class="btn btn-ghost" to="/settings">Offline settings</RouterLink>
      </div>
      <p v-if="offline" class="hint-auto">Will retry automatically when you’re back online.</p>
    </EmptyState>
  </section>
  <EmptyState
    v-else-if="offline && !catalog.loading && !summary && !loading"
    title="You're offline"
    message="This tag isn’t in the local catalog cache. Open Browse if the catalog loaded, or reconnect once to refresh indexes."
    tone="danger"
  >
    <RouterLink to="/">Back to browse</RouterLink>
  </EmptyState>
  <EmptyState
    v-else-if="error"
    title="Could not load tag"
    :message="error"
    tone="danger"
  >
    <div class="partial-actions">
      <button type="button" class="btn" :disabled="loading" @click="onRetryLoad">Retry</button>
      <RouterLink to="/">Back to browse</RouterLink>
    </div>
  </EmptyState>
</template>

<style scoped>
.tag {
  min-width: 0;
  max-width: 100%;
}
.tag-loading {
  margin: 2.5rem auto;
  text-align: center;
  color: var(--muted);
  font-size: 1rem;
}
.tag-loading.below-pitch {
  margin: 1.25rem auto 2rem;
}
.partial-meta {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.35rem 1rem;
  margin: 0.75rem 0 1.25rem;
  font-size: 0.95rem;
}
.partial-meta > div {
  display: contents;
}
.partial-meta dt {
  margin: 0;
  color: var(--muted);
  font-weight: 500;
}
.partial-meta dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
.partial-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
  margin-top: 0.85rem;
}
.hint-auto {
  margin: 0.75rem 0 0;
  font-size: 0.85rem;
  color: var(--muted);
}
.toprow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 0.35rem 0.5rem;
  margin-bottom: 0.35rem;
  min-width: 0;
}
.toprow-start {
  justify-self: start;
  min-width: 0;
}
.toprow-start > .btn {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}
.toprow-center {
  justify-self: center;
  min-width: 0;
}
.toprow-end {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}
.pager {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: nowrap;
  min-width: 0;
}
.pager .btn {
  min-height: 44px;
  padding: 0.4rem 0.65rem;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.pager .btn.disabled {
  opacity: 0.4;
  pointer-events: none;
}
.pager-short {
  display: none;
}
.pos {
  color: var(--muted);
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
  margin: 0 0.15rem;
  white-space: nowrap;
}
@media (max-width: 767px) {
  .toprow {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .toprow-start {
    display: none;
  }
  .toprow-center {
    justify-self: unset;
    flex: 1 1 auto;
    min-width: 0;
  }
  .toprow-end {
    justify-self: unset;
    flex: 0 0 auto;
  }
  .pager {
    gap: 0.25rem;
  }
  .pager .btn {
    min-width: 44px;
    padding: 0.4rem 0.55rem;
  }
  .pager-full {
    display: none;
  }
  .pager-short {
    display: inline;
  }
  .pos {
    font-size: 0.85rem;
    margin: 0;
  }
  .star {
    white-space: nowrap;
  }
}
.practice-banner {
  margin: 0.5rem 0 0.75rem;
  padding: 0.65rem 0.85rem;
  border-radius: var(--radius);
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  min-width: 0;
}
.practice-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  min-width: 0;
}
.toggle-btn {
  min-height: 44px;
  padding: 0.4rem 0.9rem;
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
.star-actions {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
  margin-left: 0;
}
.update-btn {
  min-height: 44px;
  padding: 0.45rem 0.75rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
}
.update-btn:disabled {
  opacity: 0.55;
}
.meta-only {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--muted);
  min-height: 44px;
}
.star {
  min-height: 44px;
  padding: 0.45rem 0.85rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--accent);
  font-weight: 600;
}
.star[aria-pressed='true'] {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
}
.progress {
  display: grid;
  gap: 0.35rem;
  margin: 0.5rem 0;
  font-size: 0.9rem;
  color: var(--muted);
  min-width: 0;
}
.bar {
  height: 4px;
  max-width: 100%;
  border-radius: 2px;
  background: var(--accent);
  transition: width 0.2s ease;
}
.tag h1 {
  font-family: var(--font-display);
  margin: 0;
  font-size: clamp(1.35rem, 6vw, 2rem);
  line-height: 1.2;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  white-space: normal;
}
.title-row {
  display: grid;
  gap: 0.35rem;
  margin: 0.25rem 0 0.75rem;
  min-width: 0;
  max-width: 100%;
}
.title-block {
  min-width: 0;
}
.title-head {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem 0.75rem;
  flex-wrap: wrap;
  min-width: 0;
}
.title-head h1 {
  flex: 1 1 12rem;
  min-width: 0;
}
.title-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}
.title-copy {
  min-height: 36px;
  padding: 0.35rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--muted);
  white-space: nowrap;
}
.title-copy.ok {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
.title-ext {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  min-height: 36px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--accent);
  text-decoration: none;
  font-size: 1rem;
  line-height: 1;
}
.title-ext:hover {
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  color: var(--accent-hover);
  text-decoration: none;
}
.title-block .alt-title {
  margin: 0.2rem 0 0;
  color: var(--muted);
  font-size: clamp(0.95rem, 3.5vw, 1.1rem);
  font-weight: 500;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.id-line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: center;
  margin: 0;
  min-width: 0;
}
.tag-num {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 0.95rem;
}
.arranger {
  color: var(--muted);
  font-size: 0.95rem;
  min-width: 0;
  overflow-wrap: anywhere;
}
.arranger::before {
  content: '·';
  margin-right: 0.45rem;
  color: var(--border);
}
.classic-num {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 0.85rem;
}
.classic-num.booklet-days100 {
  color: color-mix(in srgb, var(--accent) 70%, var(--text));
}
.classic-num.booklet-easytags {
  color: color-mix(in srgb, var(--text) 75%, var(--accent));
  border-color: color-mix(in srgb, var(--border) 70%, var(--accent));
  background: color-mix(in srgb, var(--surface) 92%, var(--accent));
}
.keyrow {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  min-width: 0;
}
.pay {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  flex-wrap: wrap;
  width: 100%;
  min-width: 0;
}
.paybtn {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  background: var(--accent);
  color: #fff;
  border: 0;
  border-radius: 12px;
  padding: 0.55rem 0.85rem;
  font-weight: 600;
  min-height: 52px;
  min-width: 0;
  text-align: left;
  flex: 1 1 8rem;
}
.paybtn:disabled {
  opacity: 0.5;
}
.pay-kicker {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.85;
  font-weight: 600;
}
.paybtn strong {
  font-size: clamp(1rem, 4vw, 1.15rem);
  overflow-wrap: anywhere;
}
.shift {
  color: #fff;
  font-weight: 700;
  opacity: 0.95;
}
.pay > button:not(.paybtn) {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 10px;
  padding: 0.45rem 0.65rem;
  min-height: 48px;
  min-width: 44px;
  flex: 0 0 auto;
}
.tip {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
  line-height: 1.4;
}
.section {
  margin: 1rem 0;
  padding: 0.75rem 0.85rem 0.95rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  min-width: 0;
  max-width: 100%;
}
.section-heading,
.section-summary {
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}
.section-heading {
  margin-bottom: 0.2rem;
}
.section-summary {
  list-style: none;
  cursor: pointer;
  user-select: none;
  padding: 0.25rem 0 0.35rem;
}
.section-summary::-webkit-details-marker {
  display: none;
}
.section-summary::before {
  content: '▸';
  display: inline-block;
  margin-right: 0.45rem;
  transition: transform 0.15s ease;
  color: var(--muted);
  font-size: 0.85em;
}
.section[open] > .section-summary::before {
  transform: rotate(90deg);
}
.section-body {
  margin-top: 0.75rem;
  display: grid;
  gap: 0.75rem;
  min-width: 0;
}
.pitch-section .section-body {
  margin-top: 0.65rem;
}
.meta-grid {
  display: grid;
  grid-template-columns: minmax(5rem, 34%) minmax(0, 1fr);
  gap: 0.35rem 0.65rem;
  margin: 0;
  min-width: 0;
}
.meta-grid dt {
  margin: 0;
  color: var(--muted);
  font-size: 0.82rem;
  white-space: nowrap;
}
.meta-grid dd {
  margin: 0;
  font-size: 0.9rem;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta-grid dd.multiline {
  grid-column: 1 / -1;
  white-space: pre-wrap;
  overflow: visible;
  text-overflow: unset;
  line-height: 1.45;
  overflow-wrap: anywhere;
  padding-top: 0.15rem;
}
.meta-grid dt:has(+ dd.multiline) {
  grid-column: 1 / -1;
  padding-top: 0.35rem;
}
.meta-grid dd a {
  color: var(--accent);
  text-decoration: none;
}
.meta-grid dd a:hover {
  text-decoration: underline;
}
pre {
  overflow: auto;
  font-size: 0.8rem;
  max-width: 100%;
}
.warn {
  color: var(--danger);
  font-size: 0.9rem;
  overflow-wrap: anywhere;
}
.ok {
  color: var(--accent);
  font-size: 0.9rem;
}

@media (min-width: 640px) {
  .section {
    margin: 1.25rem 0;
    padding: 0.95rem 1.15rem 1.15rem;
  }
  .section-heading,
  .section-summary {
    font-size: 1.15rem;
  }
  .meta-grid {
    grid-template-columns: minmax(7rem, 32%) 1fr;
    gap: 0.55rem 0.85rem;
  }
  .tag h1 {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    overflow-wrap: normal;
  }
}
</style>
