<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useCatalogStore } from '../stores/catalog'
import { useQueueStore } from '../stores/queue'
import { useStarsStore } from '../stores/stars'
import { useRecentStore } from '../stores/recent'
import { usePracticeStore } from '../stores/practice'
import type { PartId } from '../types/tag'
import { PitchPlayer, formatKeyShiftLabel, keyToTonicNote, transposeKeyLabel } from '../audio/pitchPlayer'
import SheetViewer from '../components/SheetViewer.vue'
import TagPlayer from '../components/TagPlayer.vue'
import TagDownloads from '../components/TagDownloads.vue'
import EmptyState from '../components/EmptyState.vue'
import type { AudioTransform } from '../types/audio'
import { useOnline } from '../composables/useOnline'
import { useTagDetail } from '../composables/useTagDetail'
import { usePreferencesStore } from '../stores/preferences'

const props = defineProps<{ id: string }>()
const catalog = useCatalogStore()
const queue = useQueueStore()
const stars = useStarsStore()
const recent = useRecentStore()
const practice = usePracticeStore()
const prefs = usePreferencesStore()
const route = useRoute()
const router = useRouter()
const { offline } = useOnline()
const idRef = toRef(props, 'id')
const {
  detail,
  error,
  fromCache,
  audioParts,
  catalogAudio,
  hasLowerQualityAudio,
  sheetAssets,
  preparedSheet,
  loading,
  sheetPreparing,
  mediaSource,
  load,
  toSummary,
} = useTagDetail(idRef)

const keyShift = ref(0)
const pitch = new PitchPlayer()
const playerTransform = ref<AudioTransform>({ pitchSemitones: 0, speed: 1 })
const queueMsg = ref<string | null>(null)
const syncingShift = ref(false)
const practiceDone = ref(false)
const cachingHq = ref(false)

const inPractice = computed(() => route.query.set === 'practice')

function readShiftFromRoute(): number {
  const raw = route.query.shift
  if (typeof raw !== 'string' || raw === '') return 0
  const n = Number(raw)
  return Number.isFinite(n) ? Math.round(n) : 0
}

onMounted(async () => {
  await catalog.load()
  await stars.ensureLoaded()
  keyShift.value = readShiftFromRoute()
  await load()
  recent.push(Number(props.id))
})

onUnmounted(() => {
  pitch.dispose()
})

watch(
  () => props.id,
  async () => {
    keyShift.value = readShiftFromRoute()
    practiceDone.value = false
    await load()
    recent.push(Number(props.id))
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
  playerTransform.value = { ...playerTransform.value, pitchSemitones: v }
  if (syncingShift.value) return
  const q = { ...route.query } as Record<string, string | string[] | undefined>
  if (v) q.shift = String(v)
  else delete q.shift
  void router.replace({ query: q })
})

watch(playerTransform, (t) => {
  if (t.pitchSemitones !== keyShift.value) keyShift.value = t.pitchSemitones
  queue.setPlaybackTransform(t)
}, { deep: true })

/** When connectivity returns, retry loading sheets/audio for this tag. */
watch(offline, (now, prev) => {
  if (prev === true && now === false) void load()
})

const summary = computed(() => catalog.getById(Number(props.id)) ?? toSummary())
const starred = computed(() => stars.isStarred(Number(props.id)))
const hasAudio = computed(() => Object.keys(audioParts.value).length > 0)
const showCacheHighQuality = computed(
  () =>
    !offline.value &&
    starred.value &&
    hasLowerQualityAudio.value &&
    !prefs.playOriginalWhileOnline &&
    !prefs.upgradeCachedOnPlay,
)
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
const zipBlockedReason = computed(() => {
  if (!hasAudio.value) return 'No audio tracks to queue.'
  if (fromCache.value || offline.value) {
    return 'Zip downloads need network paths — open this tag online, or use starred offline playback.'
  }
  return null
})

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

function addTracksToQueue(): void {
  const d = detail.value
  if (!d || zipBlockedReason.value) return
  queueMsg.value = null
  const n = Object.keys(d.audio).length
  queue.addMany(
    Object.entries(d.audio).map(([part, path]) => ({
      tagId: d.tag_id,
      title: d.title || `Tag ${d.tag_id}`,
      part: part as PartId,
      path: path!,
      transform: { ...playerTransform.value },
      format: queue.format,
    })),
  )
  queueMsg.value = `Added ${n} track(s) to downloads (uses current key/speed).`
}

async function onToggleStar(): Promise<void> {
  if (!summary.value) return
  await stars.toggle(summary.value, detail.value, { metadataOnly: false })
}

async function onRefreshMedia(): Promise<void> {
  await stars.updateOfflineMedia(Number(props.id), detail.value)
  await load()
}

async function onCacheHighQuality(): Promise<void> {
  if (!detail.value || cachingHq.value) return
  cachingHq.value = true
  try {
    await stars.cacheOriginalAudio(Number(props.id), detail.value)
    await load()
  } finally {
    cachingHq.value = false
  }
}

async function onRetryLoad(): Promise<void> {
  await load()
}
</script>

<template>
  <p v-if="loading && !detail" class="tag-loading" role="status" aria-live="polite">
    Loading tag…
  </p>
  <section v-else-if="detail" class="tag">
    <div class="toprow">
      <div class="nav-cluster">
        <RouterLink v-if="inPractice" class="btn" to="/starred">← Practice set</RouterLink>
        <RouterLink v-else class="btn" to="/">← Back</RouterLink>
      </div>
      <div class="toprow-end">
        <nav v-if="nav.total > 1 && nav.index >= 0" class="pager" aria-label="Result navigation">
          <RouterLink
            v-if="nav.prev != null"
            class="btn"
            :to="tagLink(nav.prev)"
          >
            ← Prev
          </RouterLink>
          <span v-else class="btn disabled" aria-disabled="true">← Prev</span>
          <span class="pos">{{ nav.index + 1 }} / {{ nav.total }}</span>
          <RouterLink
            v-if="nav.next != null"
            class="btn"
            :to="tagLink(nav.next)"
          >
            Next →
          </RouterLink>
          <span v-else class="btn disabled" aria-disabled="true">Next →</span>
        </nav>
        <div class="star-actions">
          <button
            type="button"
            class="star"
            :aria-pressed="starred"
            :disabled="stars.busy"
            @click="onToggleStar"
          >
            {{ starred ? '★ Starred' : '☆ Star' }}
          </button>
        </div>
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
      <h1 :title="detail.title || `Tag ${id}`">{{ detail.title || `Tag ${id}` }}</h1>
      <p class="id-line">
        <span class="tag-num">Tag #{{ detail.tag_id }}</span>
        <span v-if="detail.classic != null && detail.classic !== ''" class="classic-num"
          >Classic #{{ detail.classic }}</span
        >
        <span v-if="detail.arranger" class="arranger">{{ detail.arranger }}</span>
      </p>
    </header>
    <p v-if="fromCache || offline" class="warn" role="status">
      <template v-if="fromCache && mediaSource === 'star'">Loaded from starred offline cache.</template>
      <template v-else-if="mediaSource === 'pack'">Offline — sheets from library pack.</template>
      <template v-else>Offline — using cached media when available.</template>
    </p>
    <p
      v-if="offline && detail && !hasAudio && !starred"
      class="warn"
      role="status"
    >
      Sheets may be available offline. Star this tag (when online) to save audio for airplane mode.
      <RouterLink to="/settings">Offline settings</RouterLink>
    </p>
    <p
      v-else-if="offline && detail && !hasAudio && starred"
      class="warn"
      role="status"
    >
      No audio cached for this starred tag. We’ll retry caching when you’re back online, or use
      “Update offline media” /
      <RouterLink to="/settings">Offline settings</RouterLink>.
    </p>
    <div v-if="stars.progress" class="progress" role="status" aria-live="polite">
      <div class="bar" :style="{ width: `${Math.round(stars.progress.ratio * 100)}%` }" />
      <span>{{ stars.progress.label }}</span>
    </div>
    <p v-if="stars.lastMessage" class="ok" role="status">{{ stars.lastMessage }}</p>
    <p v-if="stars.error" class="warn" role="alert">{{ stars.error }}</p>
    <button
      v-if="starred && !offline"
      type="button"
      class="btn btn-ghost refresh"
      :disabled="stars.busy"
      @click="onRefreshMedia"
    >
      Update offline media
    </button>

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
            <button type="button" aria-label="Lower pitch one semitone" @click="keyShift--">−</button>
            <button type="button" aria-label="Raise pitch one semitone" @click="keyShift++">+</button>
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
          :catalog-paths="catalogAudio"
          :pending="false"
          :tag-id="Number(id)"
          :title="detail.title || undefined"
          :pitch-semitones="keyShift"
          :song-key="keyDisplay || undefined"
          @transform="playerTransform = $event"
          @update:pitch-semitones="keyShift = $event"
          @ended="onTrackEnded"
        />
        <button
          v-if="showCacheHighQuality"
          type="button"
          class="btn btn-ghost cache-hq"
          :disabled="cachingHq || stars.busy"
          @click="onCacheHighQuality"
        >
          {{ cachingHq ? 'Caching high quality…' : 'Cache high quality' }}
        </button>
        <EmptyState
          v-else-if="!hasAudio"
          title="No audio available"
          message="This tag has no learning tracks cached or on the server."
        />
      </div>
    </details>

    <TagDownloads
      :detail="detail"
      :transform="playerTransform"
      :queue-blocked-reason="zipBlockedReason"
      :queue-message="queueMsg"
      @add-to-queue="addTracksToQueue"
    />

    <details class="section meta">
      <summary class="section-summary">Details</summary>
      <div class="section-body">
      <dl class="meta-grid">
        <template v-if="detail.alt_title">
          <dt>Alt title</dt>
          <dd>{{ detail.alt_title }}</dd>
        </template>
        <dt>Arranger</dt>
        <dd>{{ detail.arranger || '—' }}</dd>
        <dt>Key</dt>
        <dd>{{ detail.key || '—' }}</dd>
        <dt>Written key</dt>
        <dd>{{ detail.writ_key || '—' }}</dd>
        <dt>Type</dt>
        <dd>{{ detail.type || '—' }}</dd>
        <dt>Collection</dt>
        <dd>{{ detail.collection || '—' }}</dd>
        <dt>Classic #</dt>
        <dd>{{ detail.classic ?? '—' }}</dd>
        <dt>Year</dt>
        <dd>{{ detail.year ?? '—' }}</dd>
        <dt>Rating</dt>
        <dd>
          <template v-if="detail.rating != null"
            >★ {{ detail.rating.toFixed(2) }}
            <span v-if="detail.rating_count" class="sub">({{ detail.rating_count }})</span></template
          >
          <template v-else>—</template>
        </dd>
        <dt>Downloads</dt>
        <dd>{{ detail.download_count ?? '—' }}</dd>
        <dt>Parts</dt>
        <dd>{{ detail.parts_count ?? Object.keys(detail.audio).length }}</dd>
        <dt>Audio</dt>
        <dd>{{ Object.keys(detail.audio).join(', ') || '—' }}</dd>
        <dt>Sheet</dt>
        <dd>
          {{
            detail.sheet_pages?.length
              ? `${detail.sheet_pages.length} page(s)`
              : detail.sheet
                ? 'Yes'
                : 'No'
          }}
        </dd>
        <dt>Tag ID</dt>
        <dd>{{ detail.tag_id }}</dd>
        <dt>Lyrics</dt>
        <dd class="lyrics-meta">{{ detail.lyrics?.trim() || '—' }}</dd>
        <template v-if="detail.source_folder">
          <dt>Source</dt>
          <dd class="src">{{ detail.source_folder }}</dd>
        </template>
      </dl>
      </div>
    </details>
    </template>
  </section>
  <section v-else-if="partialUnavailable && summary" class="tag tag-partial" aria-live="polite">
    <div class="toprow">
      <div class="nav-cluster">
        <RouterLink v-if="inPractice" class="btn" to="/starred">← Practice set</RouterLink>
        <RouterLink v-else class="btn" to="/">← Back</RouterLink>
      </div>
      <div class="toprow-end">
        <nav v-if="nav.total > 1 && nav.index >= 0" class="pager" aria-label="Result navigation">
          <RouterLink v-if="nav.prev != null" class="btn" :to="tagLink(nav.prev)">← Prev</RouterLink>
          <span v-else class="btn disabled" aria-disabled="true">← Prev</span>
          <span class="pos">{{ nav.index + 1 }} / {{ nav.total }}</span>
          <RouterLink v-if="nav.next != null" class="btn" :to="tagLink(nav.next)">Next →</RouterLink>
          <span v-else class="btn disabled" aria-disabled="true">Next →</span>
        </nav>
      </div>
    </div>

    <header class="title-row">
      <h1 :title="summary.title || `Tag ${id}`">{{ summary.title || `Tag ${id}` }}</h1>
      <p class="id-line">
        <span class="tag-num">Tag #{{ summary.id }}</span>
        <span v-if="summary.classic != null && summary.classic !== ''" class="classic-num"
          >Classic #{{ summary.classic }}</span
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
        <dd>{{ summary.collection }}</dd>
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
            <button type="button" aria-label="Lower pitch one semitone" @click="keyShift--">−</button>
            <button type="button" aria-label="Raise pitch one semitone" @click="keyShift++">+</button>
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
    v-else-if="offline"
    title="You're offline"
    message="This tag isn’t in the local catalog cache. Browse home if the catalog loaded, or reconnect and try again."
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
  grid-template-columns: auto 1fr;
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.35rem;
}
.nav-cluster {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  min-width: 0;
}
.nav-cluster > .btn {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}
.toprow-end {
  display: flex;
  align-items: center;
  gap: 0.5rem 0.75rem;
  flex-wrap: wrap;
  margin-left: auto;
  justify-content: flex-end;
}
.pager {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}
.pager .btn {
  min-height: 44px;
  padding: 0.4rem 0.75rem;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}
.pager .btn.disabled {
  opacity: 0.4;
  pointer-events: none;
}
.pos {
  color: var(--muted);
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
  margin: 0 0.15rem;
  white-space: nowrap;
}
.practice-banner {
  margin: 0.5rem 0 0.75rem;
  padding: 0.65rem 0.85rem;
  border-radius: var(--radius);
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}
.practice-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
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
  margin-left: auto;
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
}
.bar {
  height: 4px;
  border-radius: 2px;
  background: var(--accent);
  transition: width 0.2s ease;
}
.refresh {
  margin: 0.35rem 0 0.75rem;
}
.cache-hq {
  margin-top: 0.75rem;
}
.tag h1 {
  font-family: var(--font-display);
  margin: 0;
  font-size: clamp(1.45rem, 5vw, 2rem);
  line-height: 1.15;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.title-row {
  display: grid;
  gap: 0.35rem;
  margin: 0.25rem 0 0.75rem;
  min-width: 0;
  max-width: 100%;
}
.id-line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: center;
  margin: 0;
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
.keyrow {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}
.pay {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  flex-wrap: wrap;
  width: 100%;
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
  padding: 0.55rem 1rem;
  font-weight: 600;
  min-height: 52px;
  text-align: left;
  flex: 1 1 auto;
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
  font-size: 1.15rem;
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
  padding: 0.45rem 0.7rem;
  min-height: 48px;
  min-width: 48px;
}
.tip {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
  line-height: 1.4;
}
.lyrics-meta {
  white-space: pre-wrap;
  line-height: 1.45;
}
.section {
  margin: 1.25rem 0;
  padding: 0.95rem 1.15rem 1.15rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.section-heading,
.section-summary {
  font-family: var(--font-display);
  font-size: 1.15rem;
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
  margin-top: 0.85rem;
  display: grid;
  gap: 0.85rem;
}
.pitch-section .section-body {
  margin-top: 0.75rem;
}
.meta-grid {
  display: grid;
  grid-template-columns: minmax(7rem, 32%) 1fr;
  gap: 0.55rem 0.85rem;
  margin: 0;
}
.meta-grid dt {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
}
.meta-grid dd {
  margin: 0;
  font-size: 0.95rem;
  overflow-wrap: anywhere;
}
.meta-grid .sub {
  color: var(--muted);
  font-size: 0.85rem;
}
.meta-grid .src {
  font-size: 0.85rem;
  color: var(--muted);
}
pre {
  overflow: auto;
  font-size: 0.8rem;
}
.warn {
  color: var(--danger);
  font-size: 0.9rem;
}
.ok {
  color: var(--accent);
  font-size: 0.9rem;
}
</style>
