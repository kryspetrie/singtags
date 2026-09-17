<script setup lang="ts">
/**
 * Sing Together: freeform repertoire, packed QR share, host scan & match.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  PitchPlayer,
  keyToTonicNote,
  formatKeyShiftLabel,
  clampPitchSemitones,
} from '../audio/pitchPlayer'
import {
  getActivePitchPipeVoice,
  PITCH_PIPE_VOICE_CHANGE_EVENT,
} from '../audio/pitchPipeVoice'
import { capacityInfo, encodeProfileQr, decodeProfileFromQr, QR_MAX_BYTES } from '../lib/singTogether/codec'
import {
  matchRepertoires,
  sortMatchedSongs,
  filterMatchedSongs,
  matchCoverageLabel,
  DEFAULT_MATCH_CRITERIA,
  DEFAULT_MATCH_SORT,
  DEFAULT_MIN_PARTS_FILTER,
  type MatchCriteria,
  type MatchSort,
  type MatchedSong,
  type MinPartsFilter,
  type RosterPerson,
} from '../lib/singTogether/match'
import type { TextMatchMode } from '../lib/singTogether/normalize'
import {
  partLabel,
  partsForVoicing,
  VOICINGS,
  newSongId,
  normalizeAltTitles,
  songTitleVariants,
  type Confidence,
  type RepertoireSong,
  type Voicing,
} from '../lib/singTogether/types'
import {
  LOCAL_LIBRARY_KEY_OPTIONS,
  localLibraryKeyLabel,
} from '../types/localLibrary'
import type { QrDecodeResult } from '../lib/qrDecode'
import { tagOpenLocation } from '../lib/tagOpen'
import { navigateToLocalEntry } from '../lib/localDocOpen'
import { foldText } from '../search/normalize'
import SingTogetherCsvImportModal from '../components/SingTogetherCsvImportModal.vue'
import SingTogetherPasteTitlesModal from '../components/SingTogetherPasteTitlesModal.vue'
import SingTogetherLibraryImportModal from '../components/SingTogetherLibraryImportModal.vue'
import SingTogetherHostScanner from '../components/SingTogetherHostScanner.vue'
import SingTogetherCollectionPickerSheet from '../components/SingTogetherCollectionPickerSheet.vue'
import SingTogetherCollectionsManageSheet from '../components/SingTogetherCollectionsManageSheet.vue'
import PartConfidenceRate from '../components/PartConfidenceRate.vue'
import PitchControls from '../components/PitchControls.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import InfoTips from '../components/InfoTips.vue'
import CustomCollectionMark from '../components/CustomCollectionMark.vue'
import { useSortableListDrag } from '../composables/useSortableListDrag'
import { useTwoRowStripPaging } from '../composables/useTwoRowStripPaging'
import { useSingTogetherStore } from '../stores/singTogether'
import type { LibraryImportDraft } from '../stores/singTogether'
import { useSnackbarStore } from '../stores/snackbar'
import { useCatalogStore } from '../stores/catalog'
import { useLocalLibraryStore } from '../stores/localLibrary'
import { usePreferencesStore } from '../stores/preferences'
import type { RepertoireCsvColumn } from '../lib/singTogether/csv'
import { loadQrNudgeSeen, saveQrNudgeSeen } from '../lib/singTogether/storage'

type Mode = 'repertoire' | 'qr' | 'host'
type ListFilter = 'all' | 'needs-details'
type RepertoireSort = 'custom' | 'title' | 'arranger' | 'parts'

const store = useSingTogetherStore()
const snackbar = useSnackbarStore()
const catalog = useCatalogStore()
const localLib = useLocalLibraryStore()
const prefs = usePreferencesStore()
const router = useRouter()

const mode = ref<Mode>('repertoire')
const csvImportOpen = ref(false)
const pasteTitlesOpen = ref(false)
const libraryImportOpen = ref(false)
const importMenuOpen = ref(false)
const importMenuRef = ref<HTMLElement | null>(null)
const listFilter = ref<ListFilter>('all')
const repertoireSort = ref<RepertoireSort>('custom')
const repertoireSortReverse = ref(false)
const repertoireSearch = ref('')
const activeCollectionId = ref<string | null>(null)
const collectionPickerOpen = ref(false)
const manageCollectionsOpen = ref(false)
const displayNameEl = ref<HTMLInputElement | null>(null)
/** Add-to-repertoire panel (closed until opened from the toolbar). */
const quickAddOpen = ref(false)

/** Multi-select (Local Library / Recent pattern). */
const selectedIds = ref<Set<string>>(new Set())
const selectMode = ref(false)
const isNarrow = ref(false)
const NARROW_SELECT_MQ = '(max-width: 639px)'
const LONG_PRESS_MS = 450
const LONG_PRESS_MOVE_PX = 10
let narrowMq: MediaQueryList | null = null
let longPressTimer: ReturnType<typeof setTimeout> | null = null
let longPressId: string | null = null
let longPressX = 0
let longPressY = 0
let suppressRowClick = false

const showRowSelect = computed(
  () => selectMode.value || selectedIds.value.size > 0 || !isNarrow.value,
)

function syncNarrowSelect(): void {
  isNarrow.value = narrowMq?.matches ?? false
}

function clearSelection(): void {
  selectedIds.value = new Set()
  selectMode.value = false
}

function toggleSelect(id: string): void {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function onRowPointerDown(e: PointerEvent, id: string): void {
  if (!isNarrow.value || showRowSelect.value) return
  const t = e.target as HTMLElement | null
  if (t?.closest('.sel-btn, .row-remove, .row-open, .song-edit, .drag-handle, a, input, select, textarea, button')) {
    return
  }
  longPressId = id
  longPressX = e.clientX
  longPressY = e.clientY
  if (longPressTimer != null) clearTimeout(longPressTimer)
  longPressTimer = setTimeout(() => {
    longPressTimer = null
    if (longPressId !== id) return
    selectMode.value = true
    toggleSelect(id)
    suppressRowClick = true
    try {
      navigator.vibrate?.(10)
    } catch {
      /* ignore */
    }
  }, LONG_PRESS_MS)
}

function onRowPointerMove(e: PointerEvent): void {
  if (longPressTimer == null) return
  const dx = e.clientX - longPressX
  const dy = e.clientY - longPressY
  if (dx * dx + dy * dy > LONG_PRESS_MOVE_PX * LONG_PRESS_MOVE_PX) {
    clearTimeout(longPressTimer)
    longPressTimer = null
    longPressId = null
  }
}

function onRowPointerEnd(): void {
  if (longPressTimer != null) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
  longPressId = null
}

function onRowClickCapture(e: MouseEvent): void {
  if (!suppressRowClick) return
  e.preventDefault()
  e.stopPropagation()
  suppressRowClick = false
}
/**
 * QR nudge: persist after the user has seen it; keep visible for the current
 * show cycle via latch. Cleared when the repertoire is emptied.
 */
const qrNudgeSeen = ref(loadQrNudgeSeen())
const qrNudgeLatch = ref(false)

watch(
  () => store.songCount,
  (n) => {
    if (n === 0) {
      qrNudgeSeen.value = false
      qrNudgeLatch.value = false
      saveQrNudgeSeen(false)
      return
    }
    if (!qrNudgeSeen.value) {
      qrNudgeLatch.value = true
      qrNudgeSeen.value = true
      saveQrNudgeSeen(true)
    }
  },
  { immediate: true },
)

/** Per-row expand. */
const expandedIds = ref<Set<string>>(new Set())

/** Link picker for one expanded song at a time. */
const linkPickerSongId = ref<string | null>(null)
const linkPickerKind = ref<'tag' | 'library' | null>(null)
const tagQuery = ref('')
const libraryQuery = ref('')

type SongOpenTarget =
  | { kind: 'tag'; tagId: number; label: string; linked: boolean }
  | { kind: 'library'; entryId: string; label: string; linked: boolean }

const libraryEnabled = computed(() => prefs.localLibraryEnabled)

/** Exact folded title → first catalog / library hit (for open-when-available). */
const titleTagIndex = computed(() => {
  const map = new Map<string, { id: number; title: string }>()
  for (const t of catalog.tags) {
    const display = t.title || `Tag ${t.id}`
    for (const raw of [t.title, t.altTitle]) {
      const key = foldText(raw || '')
      if (!key || map.has(key)) continue
      map.set(key, { id: t.id, title: display })
    }
  }
  return map
})

const titleLibraryIndex = computed(() => {
  const map = new Map<string, { id: string; title: string }>()
  if (!libraryEnabled.value) return map
  for (const e of localLib.entries) {
    const key = foldText(e.title || '')
    if (!key || map.has(key)) continue
    map.set(key, { id: e.id, title: e.title || 'Library song' })
  }
  return map
})

function songOpenTarget(song: RepertoireSong): SongOpenTarget | null {
  const wantTag = song.isTag === true

  if (wantTag) {
    if (typeof song.tagId === 'number' && song.tagId > 0) {
      const hit = catalog.getById(song.tagId)
      return {
        kind: 'tag',
        tagId: song.tagId,
        label: hit?.title || `Tag ${song.tagId}`,
        linked: true,
      }
    }
    for (const variant of songTitleVariants(song)) {
      const key = foldText(variant)
      if (!key) continue
      const tag = titleTagIndex.value.get(key)
      if (tag) {
        return { kind: 'tag', tagId: tag.id, label: tag.title, linked: false }
      }
    }
    return null
  }

  if (song.localEntryId) {
    const hit = localLib.entries.find((e) => e.id === song.localEntryId)
    return {
      kind: 'library',
      entryId: song.localEntryId,
      label: hit?.title || 'Library song',
      linked: true,
    }
  }
  // Explicit tag link still opens even if Tag checkbox is off.
  if (typeof song.tagId === 'number' && song.tagId > 0) {
    const hit = catalog.getById(song.tagId)
    return {
      kind: 'tag',
      tagId: song.tagId,
      label: hit?.title || `Tag ${song.tagId}`,
      linked: true,
    }
  }
  for (const variant of songTitleVariants(song)) {
    const key = foldText(variant)
    if (!key) continue
    const lib = titleLibraryIndex.value.get(key)
    if (lib) {
      return { kind: 'library', entryId: lib.id, label: lib.title, linked: false }
    }
  }
  return null
}

function openSongPage(song: RepertoireSong, ev?: Event): void {
  ev?.stopPropagation()
  const target = songOpenTarget(song)
  if (!target) return
  if (target.kind === 'tag') {
    void router.push(tagOpenLocation(target.tagId))
    return
  }
  void navigateToLocalEntry(router, target.entryId)
}

function songOpenLabel(song: RepertoireSong): string {
  const target = songOpenTarget(song)
  if (!target) return ''
  return target.kind === 'library'
    ? `Open My Library: ${target.label}`
    : `Open tag: ${target.label}`
}

function songLinkActionLabel(song: RepertoireSong): string {
  return song.isTag ? 'Link tag…' : 'Link library…'
}

function openSongLinkPickerForSong(song: RepertoireSong): void {
  openSongLinkPicker(song, song.isTag ? 'tag' : libraryEnabled.value ? 'library' : 'tag')
}

function openSongLinkPicker(song: RepertoireSong, kind: 'tag' | 'library'): void {
  if (linkPickerSongId.value === song.id && linkPickerKind.value === kind) {
    linkPickerSongId.value = null
    linkPickerKind.value = null
    return
  }
  linkPickerSongId.value = song.id
  linkPickerKind.value = kind
  if (kind === 'tag') {
    tagQuery.value = song.title || ''
  } else {
    libraryQuery.value = song.title || ''
    void localLib.ensureLoaded()
  }
}

function closeSongLinkPicker(): void {
  linkPickerSongId.value = null
  linkPickerKind.value = null
  tagQuery.value = ''
  libraryQuery.value = ''
}

const tagHits = computed(() => {
  const q = tagQuery.value.trim()
  if (!q) return []
  catalog.queryText = q
  return catalog.allResults.slice(0, 12)
})

const libraryHits = computed(() => {
  const q = libraryQuery.value.trim().toLowerCase()
  const list = localLib.entries
  if (!q) return list.slice(0, 12)
  return list
    .filter((e) => {
      const hay = `${e.title}\n${e.arranger}\n${e.notes}`.toLowerCase()
      return hay.includes(q)
    })
    .slice(0, 12)
})

function linkSongTag(song: RepertoireSong, hit: { id: number; title?: string | null }): void {
  patchSong(song, { tagId: hit.id, localEntryId: undefined, isTag: true })
  closeSongLinkPicker()
  snackbar.show(`Linked to tag: ${hit.title || hit.id}`, { tone: 'ok', ms: 2500 })
}

function linkSongLibrary(song: RepertoireSong, hit: { id: string; title: string }): void {
  const entry = localLib.entries.find((e) => e.id === hit.id)
  patchSong(song, {
    localEntryId: hit.id,
    tagId: undefined,
    isTag: undefined,
    ...(entry
      ? {
          title: entry.title.trim() || song.title,
          arranger: entry.arranger.trim(),
          key: entry.key?.trim() || undefined,
        }
      : {}),
  })
  closeSongLinkPicker()
  snackbar.show(`Linked to My Library: ${hit.title || 'song'}`, { tone: 'ok', ms: 2500 })
}

function clearSongLink(song: RepertoireSong): void {
  patchSong(song, { tagId: undefined, localEntryId: undefined })
  closeSongLinkPicker()
}

function setSongIsTag(song: RepertoireSong, isTag: boolean): void {
  if (isTag) {
    patchSong(song, { isTag: true, localEntryId: undefined })
  } else {
    patchSong(song, { isTag: undefined, tagId: undefined })
  }
}

onMounted(() => {
  if (libraryEnabled.value) void localLib.ensureLoaded()
  narrowMq = window.matchMedia(NARROW_SELECT_MQ)
  syncNarrowSelect()
  narrowMq.addEventListener('change', syncNarrowSelect)
  window.addEventListener(PITCH_PIPE_VOICE_CHANGE_EVENT, syncPitchVoice)
})

watch(libraryEnabled, (on) => {
  if (on) void localLib.ensureLoaded()
})

/** Sync title/arranger/key from My Library; unlink when the source entry is gone. */
watch(
  () => [libraryEnabled.value, localLib.entries] as const,
  ([on, entries]) => {
    if (!on) return
    const map = new Map(
      entries.map((e) => [
        e.id,
        { title: e.title, arranger: e.arranger, key: e.key } as const,
      ]),
    )
    store.syncLinkedLibrarySongs(map)
  },
  { deep: true },
)

const linkedLibraryEntryIds = computed(() =>
  store.profile.songs
    .map((s) => s.localEntryId?.trim())
    .filter((id): id is string => !!id),
)

/** True while linked to a live My Library entry (title/arranger/key are read-only). */
function isLibrarySourceLocked(song: RepertoireSong): boolean {
  const id = song.localEntryId?.trim()
  if (!id || !libraryEnabled.value) return false
  return localLib.entries.some((e) => e.id === id)
}

const quickTitle = ref('')
const quickTitlePills = ref<string[]>([])
const quickTitleDraft = ref('')
const quickArranger = ref('')
const quickKey = ref('')
const quickVoicing = ref<Voicing | ''>('')
const quickParts = ref<Record<string, Confidence>>({})
const quickIsTag = ref(false)
const quickLinkQuery = ref('')
const quickLinkTagId = ref<number | null>(null)
const quickLinkEntryId = ref<string | null>(null)
const quickLinkLabel = ref('')
const quickLinkHighlight = ref(-1)
const quickTitleEl = ref<HTMLInputElement | null>(null)
const quickArrangerEl = ref<HTMLInputElement | null>(null)
const quickKnowEl = ref<HTMLButtonElement | null>(null)
const quickTagEl = ref<HTMLButtonElement | null>(null)
const quickLinkEl = ref<HTMLInputElement | null>(null)
const quickRateEl = ref<HTMLElement | null>(null)
const quickRateHover = ref<number | null>(null)
const quickKeyEl = ref<HTMLSelectElement | null>(null)
const quickVoicingEl = ref<HTMLSelectElement | null>(null)

type ChipKind = 'title' | 'arranger' | 'tag' | 'parts' | 'key' | 'voicing' | 'link'
type QuickCursor =
  | { kind: 'title' }
  | { kind: 'arranger' }
  | { kind: 'tag' }
  | { kind: 'part-know'; partId: string }
  | { kind: 'part-rate'; partId: string }
  | { kind: 'key' }
  | { kind: 'voicing' }
  | { kind: 'link' }

const CHIP_KINDS: readonly ChipKind[] = [
  'title',
  'arranger',
  'tag',
  'parts',
  'key',
  'voicing',
  'link',
]
const CHIP_LABEL: Record<ChipKind, string> = {
  title: 'Title',
  arranger: 'Arranger',
  tag: 'Tag',
  parts: 'Parts',
  key: 'Key',
  voicing: 'Voicing',
  link: 'Link',
}

const quickCursor = ref<QuickCursor>({ kind: 'title' })

const quickPartsList = computed(() =>
  partsForVoicing(quickVoicing.value || undefined),
)

function cursorKey(c: QuickCursor): string {
  if (c.kind === 'part-know' || c.kind === 'part-rate') return `${c.kind}:${c.partId}`
  return c.kind
}

function sameCursor(a: QuickCursor, b: QuickCursor): boolean {
  return cursorKey(a) === cursorKey(b)
}

/** Flat Tab order; rate steps only appear for parts marked known. */
function quickSequence(): QuickCursor[] {
  const seq: QuickCursor[] = [{ kind: 'title' }, { kind: 'arranger' }, { kind: 'tag' }]
  for (const partId of quickPartsList.value) {
    seq.push({ kind: 'part-know', partId })
    if (Object.prototype.hasOwnProperty.call(quickParts.value, partId)) {
      seq.push({ kind: 'part-rate', partId })
    }
  }
  seq.push({ kind: 'key' }, { kind: 'voicing' }, { kind: 'link' })
  return seq
}

function currentChipKind(): ChipKind {
  const k = quickCursor.value.kind
  if (k === 'part-know' || k === 'part-rate') return 'parts'
  return k
}

function parseTitleField(raw: string): { title: string; altTitles?: string[] } {
  const chunks = raw
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!chunks.length) return { title: '' }
  const [title, ...rest] = chunks
  return { title: title!, altTitles: normalizeAltTitles(rest) }
}

function formatTitleField(song: Pick<RepertoireSong, 'title' | 'altTitles'>): string {
  const alts = song.altTitles ?? []
  if (!alts.length) return song.title
  return [song.title, ...alts].join('; ')
}

function syncQuickTitleFromTokens(): void {
  const bits = [...quickTitlePills.value]
  const draft = quickTitleDraft.value.trim()
  if (draft) bits.push(draft)
  quickTitle.value = bits.join('; ')
}

function lockQuickTitleDraft(): boolean {
  const t = quickTitleDraft.value.trim()
  if (!t) return false
  quickTitlePills.value = [...quickTitlePills.value, t]
  quickTitleDraft.value = ''
  syncQuickTitleFromTokens()
  // #region agent log
  fetch('http://127.0.0.1:7329/ingest/3e818d75-7333-4f02-b4aa-7062f01b9151',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eb58db'},body:JSON.stringify({sessionId:'eb58db',runId:'repro5',hypothesisId:'T',location:'SingTogetherView.vue:lockQuickTitleDraft',message:'locked title pill',data:{pillCount:quickTitlePills.value.length,last:quickTitlePills.value.at(-1)??null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return true
}

function unlockLastTitlePill(): boolean {
  if (!quickTitlePills.value.length || quickTitleDraft.value.length) return false
  const pills = [...quickTitlePills.value]
  const last = pills.pop()!
  quickTitlePills.value = pills
  quickTitleDraft.value = last
  syncQuickTitleFromTokens()
  // #region agent log
  fetch('http://127.0.0.1:7329/ingest/3e818d75-7333-4f02-b4aa-7062f01b9151',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eb58db'},body:JSON.stringify({sessionId:'eb58db',runId:'repro5',hypothesisId:'T',location:'SingTogetherView.vue:unlockLastTitlePill',message:'unlocked title pill',data:{pillCount:quickTitlePills.value.length,draftLen:quickTitleDraft.value.length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return true
}

function removeTitlePill(index: number): void {
  quickTitlePills.value = quickTitlePills.value.filter((_, i) => i !== index)
  syncQuickTitleFromTokens()
  void nextTick(() => quickTitleEl.value?.focus())
}

/** Split pasted "a; b; c" into pills + trailing draft. */
function onQuickTitleDraftInput(ev?: Event): void {
  const raw =
    ev && ev.target instanceof HTMLInputElement
      ? ev.target.value
      : quickTitleDraft.value
  if (!raw.includes(';')) {
    quickTitleDraft.value = raw
    syncQuickTitleFromTokens()
    return
  }
  const chunks = raw.split(';')
  const locked = chunks
    .slice(0, -1)
    .map((s) => s.trim())
    .filter(Boolean)
  const rest = (chunks[chunks.length - 1] ?? '').replace(/^\s+/, '')
  if (locked.length) {
    quickTitlePills.value = [...quickTitlePills.value, ...locked]
  }
  quickTitleDraft.value = rest
  syncQuickTitleFromTokens()
}

function onQuickTitleTokenKeydown(ev: KeyboardEvent): void {
  if (ev.key === ';' || ev.code === 'Semicolon') {
    ev.preventDefault()
    lockQuickTitleDraft()
    return
  }
  if (ev.key === 'Backspace' && quickTitleDraft.value === '' && quickTitlePills.value.length) {
    ev.preventDefault()
    unlockLastTitlePill()
  }
}

function resetQuickAdd(): void {
  quickTitle.value = ''
  quickTitlePills.value = []
  quickTitleDraft.value = ''
  quickArranger.value = ''
  quickKey.value = ''
  quickVoicing.value = ''
  quickParts.value = {}
  quickIsTag.value = false
  quickLinkQuery.value = ''
  quickLinkTagId.value = null
  quickLinkEntryId.value = null
  quickLinkLabel.value = ''
  quickLinkHighlight.value = -1
  quickCursor.value = { kind: 'title' }
  void nextTick(() => focusQuickCursor())
}

function focusQuickCursor(): void {
  const c = quickCursor.value
  if (c.kind === 'title') quickTitleEl.value?.focus()
  else if (c.kind === 'arranger') quickArrangerEl.value?.focus()
  else if (c.kind === 'tag') quickTagEl.value?.focus()
  else if (c.kind === 'link') quickLinkEl.value?.focus()
  else if (c.kind === 'part-know') quickKnowEl.value?.focus()
  else if (c.kind === 'part-rate') quickRateEl.value?.focus()
  else if (c.kind === 'key') quickKeyEl.value?.focus()
  else quickVoicingEl.value?.focus()
}

function setQuickCursor(c: QuickCursor): void {
  quickRateHover.value = null
  quickCursor.value = c
  if (c.kind === 'link') seedQuickLinkQuery()
  void nextTick(() => focusQuickCursor())
}

function goChip(kind: ChipKind): void {
  if (kind === 'parts') {
    const first = quickPartsList.value[0]
    if (first) setQuickCursor({ kind: 'part-know', partId: first })
    return
  }
  setQuickCursor({ kind })
}

function retreatQuickStep(): void {
  const seq = quickSequence()
  const idx = seq.findIndex((c) => sameCursor(c, quickCursor.value))
  if (idx > 0) setQuickCursor(seq[idx - 1]!)
}

function advanceQuickStep(): void {
  const seq = quickSequence()
  const idx = seq.findIndex((c) => sameCursor(c, quickCursor.value))
  // #region agent log
  fetch('http://127.0.0.1:7329/ingest/3e818d75-7333-4f02-b4aa-7062f01b9151',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eb58db'},body:JSON.stringify({sessionId:'eb58db',runId:'repro2',hypothesisId:'C',location:'SingTogetherView.vue:advanceQuickStep',message:'advanceQuickStep',data:{cursor:cursorKey(quickCursor.value),idx,seqLen:seq.length,partCount:Object.keys(quickParts.value).length,parts:Object.keys(quickParts.value)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (idx < 0) return
  if (quickCursor.value.kind === 'title' && !parseTitleField(quickTitle.value).title) return
  if (idx >= seq.length - 1) {
    if (parseTitleField(quickTitle.value).title) commitQuickAdd()
    return
  }
  setQuickCursor(seq[idx + 1]!)
}

function chipLabel(kind: ChipKind): string {
  if (kind === 'title') {
    const { title, altTitles } = parseTitleField(quickTitle.value)
    if (!title) return '—'
    if (altTitles?.length) return `${title} (+${altTitles.length})`
    return title
  }
  if (kind === 'arranger') return quickArranger.value.trim() || '—'
  if (kind === 'tag') return quickIsTag.value ? 'Yes' : '—'
  if (kind === 'link') return quickLinkLabel.value || '—'
  if (kind === 'parts') {
    const ids = Object.keys(quickParts.value)
    if (!ids.length) return '—'
    return ids.map((id) => partLabel(id)).join(', ')
  }
  if (kind === 'key') {
    const k = quickKey.value.trim()
    return k ? localLibraryKeyLabel(k) : '—'
  }
  return quickVoicing.value || '—'
}

function chipFilled(kind: ChipKind): boolean {
  if (kind === 'title') return !!parseTitleField(quickTitle.value).title
  if (kind === 'arranger') return !!quickArranger.value.trim()
  if (kind === 'tag') return quickIsTag.value
  if (kind === 'link') return !!quickLinkLabel.value
  if (kind === 'parts') return Object.keys(quickParts.value).length > 0
  if (kind === 'key') return !!quickKey.value.trim()
  return !!quickVoicing.value
}

/** Ghost slots unlock once we reach that section (or if already filled). */
function chipUnlocked(kind: ChipKind): boolean {
  return (
    chipFilled(kind) ||
    CHIP_KINDS.indexOf(kind) <= CHIP_KINDS.indexOf(currentChipKind())
  )
}

function knowsQuickPart(partId: string): boolean {
  return Object.prototype.hasOwnProperty.call(quickParts.value, partId)
}

function toggleQuickKnow(partId: string): void {
  const parts = { ...quickParts.value }
  if (Object.prototype.hasOwnProperty.call(parts, partId)) {
    delete parts[partId]
    quickParts.value = parts
    if (
      quickCursor.value.kind === 'part-rate' &&
      quickCursor.value.partId === partId
    ) {
      setQuickCursor({ kind: 'part-know', partId })
    }
  } else {
    parts[partId] = 0
    quickParts.value = parts
  }
  // #region agent log
  fetch('http://127.0.0.1:7329/ingest/3e818d75-7333-4f02-b4aa-7062f01b9151',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eb58db'},body:JSON.stringify({sessionId:'eb58db',runId:'repro3',hypothesisId:'B',location:'SingTogetherView.vue:toggleQuickKnow',message:'toggleQuickKnow',data:{partId,knows:knowsQuickPart(partId),partCount:Object.keys(quickParts.value).length,cursor:cursorKey(quickCursor.value)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
}

function setQuickPartConf(partId: string, conf: number): void {
  if (!knowsQuickPart(partId)) return
  const next = Math.max(0, Math.min(5, conf)) as Confidence
  quickParts.value = { ...quickParts.value, [partId]: next }
  quickRateHover.value = null
  // #region agent log
  fetch('http://127.0.0.1:7329/ingest/3e818d75-7333-4f02-b4aa-7062f01b9151',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eb58db'},body:JSON.stringify({sessionId:'eb58db',runId:'repro4',hypothesisId:'B',location:'SingTogetherView.vue:setQuickPartConf',message:'setQuickPartConf',data:{partId,conf:next},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
}

function nudgeQuickPartConf(delta: number): void {
  const c = quickCursor.value
  if (c.kind !== 'part-rate') return
  const cur = quickParts.value[c.partId] ?? 0
  setQuickPartConf(c.partId, cur + delta)
}

function quickRatePreview(partId: string): number {
  return quickRateHover.value ?? quickParts.value[partId] ?? 0
}

function setQuickRateHover(n: number | null): void {
  quickRateHover.value = n
}

function onQuickVoicingChange(): void {
  const allowed = new Set(partsForVoicing(quickVoicing.value || undefined))
  const next: Record<string, Confidence> = {}
  for (const [id, conf] of Object.entries(quickParts.value)) {
    if (allowed.has(id)) next[id] = conf
  }
  quickParts.value = next
  // If current part cursor is no longer valid, jump to key.
  const c = quickCursor.value
  if (
    (c.kind === 'part-know' || c.kind === 'part-rate') &&
    !allowed.has(c.partId)
  ) {
    setQuickCursor({ kind: 'key' })
  }
}

function seedQuickLinkQuery(): void {
  if (!quickIsTag.value) void localLib.ensureLoaded()
  if (quickLinkTagId.value != null || quickLinkEntryId.value) return
  const title = parseTitleField(quickTitle.value).title
  if (title) quickLinkQuery.value = title
  quickLinkHighlight.value = -1
}

function clearQuickLink(): void {
  quickLinkTagId.value = null
  quickLinkEntryId.value = null
  quickLinkLabel.value = ''
  quickLinkHighlight.value = -1
}

function toggleQuickIsTag(): void {
  quickIsTag.value = !quickIsTag.value
  clearQuickLink()
  if (quickCursor.value.kind === 'link') seedQuickLinkQuery()
}

type QuickLinkHit =
  | { kind: 'tag'; id: number; title: string }
  | { kind: 'library'; id: string; title: string; arranger?: string }

const quickLinkHits = computed((): QuickLinkHit[] => {
  const q = quickLinkQuery.value.trim()
  if (quickIsTag.value) {
    if (!q) return []
    catalog.queryText = q
    return catalog.allResults.slice(0, 12).map((hit) => ({
      kind: 'tag' as const,
      id: hit.id,
      title: hit.title || `Tag ${hit.id}`,
    }))
  }
  if (!libraryEnabled.value) return []
  const list = localLib.entries
  const ql = q.toLowerCase()
  const filtered = !ql
    ? list.slice(0, 12)
    : list
        .filter((e) => {
          const hay = `${e.title}\n${e.arranger}\n${e.notes}`.toLowerCase()
          return hay.includes(ql)
        })
        .slice(0, 12)
  return filtered.map((e) => ({
    kind: 'library' as const,
    id: e.id,
    title: e.title || 'Untitled',
    arranger: e.arranger || undefined,
  }))
})

function pickQuickLink(hit: QuickLinkHit): void {
  if (hit.kind === 'tag') {
    quickLinkTagId.value = hit.id
    quickLinkEntryId.value = null
    quickIsTag.value = true
  } else {
    quickLinkEntryId.value = hit.id
    quickLinkTagId.value = null
    quickIsTag.value = false
  }
  quickLinkLabel.value = hit.title
  quickLinkQuery.value = hit.title
  quickLinkHighlight.value = -1
}

function onQuickLinkQueryInput(): void {
  // Typing invalidates a prior pick unless the query still matches the label.
  if (quickLinkLabel.value && quickLinkQuery.value.trim() !== quickLinkLabel.value) {
    quickLinkTagId.value = null
    quickLinkEntryId.value = null
    quickLinkLabel.value = ''
  }
  quickLinkHighlight.value = quickLinkHits.value.length ? 0 : -1
}

function songNeedsDetails(song: RepertoireSong): boolean {
  /** Bare title (+ AKAs) only — any arranger/key/voicing/parts means not “title only”. */
  return (
    !song.arranger?.trim() &&
    !song.key?.trim() &&
    !song.voicing &&
    Object.keys(song.parts).length === 0
  )
}

const needsDetailsCount = computed(() => {
  const flagged = store.profile.songs.filter(songNeedsDetails)
  // #region agent log
  fetch('http://127.0.0.1:7329/ingest/3e818d75-7333-4f02-b4aa-7062f01b9151',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eb58db'},body:JSON.stringify({sessionId:'eb58db',runId:'repro6',hypothesisId:'H1',location:'SingTogetherView.vue:needsDetailsCount',message:'title-only filter recount',data:{count:flagged.length,titles:flagged.map((s)=>s.title),all:store.profile.songs.map((s)=>({t:s.title,arr:!!s.arranger?.trim(),key:!!s.key?.trim(),voi:!!s.voicing,parts:Object.keys(s.parts).length}))},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return flagged.length
})

const collectionChips = computed(() => store.collections)
const collectionCounts = computed(() => {
  const map: Record<string, number> = {}
  for (const c of store.collections) map[c.id] = c.songIds.length
  return map
})

const collectionStripHost = ref<HTMLElement | null>(null)
const collectionMeasureEl = ref<HTMLElement | null>(null)
const {
  page: collectionPage,
  showPager: showCollectionPager,
  pageCount: collectionPageCount,
  pagedItems: pagedCollectionChips,
  pageForIndex: collectionPageForIndex,
} = useTwoRowStripPaging(collectionChips, {
  hostEl: collectionStripHost,
  measureEl: collectionMeasureEl,
})

watch(activeCollectionId, (id) => {
  if (!id || !showCollectionPager.value) return
  const idx = collectionChips.value.findIndex((c) => c.id === id)
  if (idx < 0) return
  collectionPage.value = collectionPageForIndex(idx)
})

const scopedSongs = computed(() => {
  const all = store.profile.songs
  const colId = activeCollectionId.value
  if (!colId) return all
  const col = store.collectionById(colId)
  if (!col) return []
  const byId = new Map(all.map((s) => [s.id, s]))
  return col.songIds.map((id) => byId.get(id)).filter((s): s is RepertoireSong => !!s)
})

const canReorder = computed(
  () =>
    listFilter.value === 'all' &&
    repertoireSort.value === 'custom' &&
    !repertoireSortReverse.value &&
    !repertoireSearch.value.trim(),
)

const {
  onHandlePointerDown,
  onDragEnter,
  rowDragClass,
  listDraggingClass,
} = useSortableListDrag<string>({
  rowSelector: 'li.list-row',
  onReorder: (songId, toIndex) => {
    if (!canReorder.value) return
    store.reorderSong(songId, toIndex, activeCollectionId.value)
  },
})

function songMatchesSearch(song: RepertoireSong, rawQuery: string): boolean {
  const q = foldText(rawQuery)
  if (!q) return true
  const tokens = q.split(/\s+/).filter(Boolean)
  if (!tokens.length) return true
  const hay = foldText(
    [song.title, ...(song.altTitles ?? []), song.arranger, song.key ?? ''].join(' '),
  )
  return tokens.every((t) => hay.includes(t))
}

const displayedSongs = computed(() => {
  let songs = scopedSongs.value
  if (listFilter.value === 'needs-details') songs = songs.filter(songNeedsDetails)
  const q = repertoireSearch.value
  if (q.trim()) songs = songs.filter((s) => songMatchesSearch(s, q))
  songs = sortRepertoireSongs(songs, repertoireSort.value)
  if (repertoireSortReverse.value) songs = [...songs].reverse()
  return songs
})

const repertoireCountLabel = computed(() => {
  const n = displayedSongs.value.length
  const scoped = scopedSongs.value
  const scopedFiltered =
    listFilter.value === 'needs-details' ? scoped.filter(songNeedsDetails) : scoped
  const total = scopedFiltered.length
  const col = activeCollectionId.value
    ? store.collectionById(activeCollectionId.value)
    : null
  const searching = !!repertoireSearch.value.trim()
  const filtered = listFilter.value === 'needs-details'
  if (col) {
    if (searching || filtered) return `${n} of ${total} in “${col.name}”`
    return `${n} in “${col.name}”`
  }
  if (searching || filtered) {
    return `${n} of ${total} song${total === 1 ? '' : 's'}`
  }
  return `${n} song${n === 1 ? '' : 's'}`
})

function sortReverseTip(): string {
  return repertoireSortReverse.value
    ? 'Reverse order is on — click for the default direction'
    : 'Reverse view order'
}

function sortRepertoireSongs(songs: RepertoireSong[], mode: RepertoireSort): RepertoireSong[] {
  if (mode === 'custom') return songs
  const list = [...songs]
  const titleKey = (s: RepertoireSong) => (s.title || '').trim().toLowerCase()
  const arrKey = (s: RepertoireSong) => (s.arranger || '').trim().toLowerCase()
  if (mode === 'title') {
    return list.sort((a, b) => titleKey(a).localeCompare(titleKey(b)) || a.id.localeCompare(b.id))
  }
  if (mode === 'arranger') {
    return list.sort((a, b) => {
      const aa = arrKey(a)
      const bb = arrKey(b)
      if (!aa && bb) return 1
      if (aa && !bb) return -1
      return aa.localeCompare(bb) || titleKey(a).localeCompare(titleKey(b))
    })
  }
  // parts: most marked first
  return list.sort((a, b) => {
    const ac = Object.keys(a.parts).length
    const bc = Object.keys(b.parts).length
    return bc - ac || titleKey(a).localeCompare(titleKey(b))
  })
}

function selectCollection(id: string | null): void {
  activeCollectionId.value = id
}

function openCollectionPicker(): void {
  if (!selectedIds.value.size) return
  collectionPickerOpen.value = true
}

function onCollectionPickerDone(_id: string, name: string): void {
  clearSelection()
  snackbar.show(`Added to “${name}”`, { tone: 'ok', ms: 4000 })
}

function removeSelectedFromCollection(): void {
  const colId = activeCollectionId.value
  if (!colId || !selectedIds.value.size) return
  store.removeSongsFromCollection(colId, [...selectedIds.value])
  clearSelection()
}

function onManageCollectionCreated(id: string): void {
  activeCollectionId.value = id
}

function onManageCollectionDeleted(id: string): void {
  if (activeCollectionId.value === id) activeCollectionId.value = null
}

watch(
  () => store.profile.songs.map((s) => s.id).join(','),
  () => {
    const alive = new Set(store.profile.songs.map((s) => s.id))
    const next = new Set([...selectedIds.value].filter((id) => alive.has(id)))
    if (next.size !== selectedIds.value.size) selectedIds.value = next
    if (next.size === 0) selectMode.value = false
  },
)

watch(
  () => selectedIds.value.size,
  (n) => {
    if (n === 0) selectMode.value = false
  },
)

const showQrNudge = computed(() => store.songCount > 0 && qrNudgeLatch.value)

watch(needsDetailsCount, (n) => {
  if (n === 0 && listFilter.value === 'needs-details') listFilter.value = 'all'
})

function keyOptionsFor(currentKey?: string): string[] {
  const current = currentKey?.trim() ?? ''
  if (current && !(LOCAL_LIBRARY_KEY_OPTIONS as readonly string[]).includes(current)) {
    return [current, ...LOCAL_LIBRARY_KEY_OPTIONS]
  }
  return [...LOCAL_LIBRARY_KEY_OPTIONS]
}

const quickKeyOptions = computed(() => keyOptionsFor(quickKey.value))

/** Collapsed row meta labels (Browse-style separate spans, not middots). */
function songVoicingLabel(song: Pick<RepertoireSong, 'voicing'>): string {
  return song.voicing || ''
}

function songKeyLabel(song: Pick<RepertoireSong, 'key'>): string {
  const key = song.key?.trim()
  return key ? localLibraryKeyLabel(key) || key : ''
}

function songCanPitch(song: Pick<RepertoireSong, 'key'>): boolean {
  return !!keyToTonicNote(song.key)
}

/** Session-only pitch shift per song (semitones); not persisted. */
const songPitchShift = ref<Record<string, number>>({})

function songShiftSemitones(songId: string): number {
  return clampPitchSemitones(songPitchShift.value[songId] ?? 0)
}

function setSongPitch(songId: string, shift: number): void {
  const next = clampPitchSemitones(shift)
  if (!next) {
    if (!(songId in songPitchShift.value)) return
    const copy = { ...songPitchShift.value }
    delete copy[songId]
    songPitchShift.value = copy
    return
  }
  songPitchShift.value = { ...songPitchShift.value, [songId]: next }
}

/** PitchControls label (same format as Tag / Local Doc). */
function songPitchShiftLabel(song: Pick<RepertoireSong, 'id' | 'key'>): string {
  return formatKeyShiftLabel(song.key, songShiftSemitones(song.id))
}

const pitchPlayer = new PitchPlayer(getActivePitchPipeVoice())

function syncPitchVoice(): void {
  pitchPlayer.setVoice(getActivePitchPipeVoice())
}

async function paySongPitchDown(song: RepertoireSong, ev?: Event): Promise<void> {
  ev?.stopPropagation()
  const note = keyToTonicNote(song.key)
  if (!note) {
    snackbar.show('Set a key on the song to play pitch.', { tone: 'info', ms: 2500 })
    return
  }
  const cents = songShiftSemitones(song.id) * 100 + prefs.globalPitchDetuneCents()
  await pitchPlayer.start(note, cents)
}

function paySongPitchUp(ev?: Event): void {
  ev?.stopPropagation()
  pitchPlayer.stop()
}

function songAkaLabel(song: RepertoireSong): string {
  return song.altTitles?.length ? song.altTitles.join(', ') : ''
}

function songPartMetaItems(song: RepertoireSong): string[] {
  const ids = Object.keys(song.parts)
  if (!ids.length) {
    return songNeedsDetails(song) ? [] : ['Parts later']
  }
  return ids.map((p) => {
    const conf = song.parts[p] ?? 0
    const label = partLabel(p)
    return conf > 0 ? `${label} ${conf}★` : label
  })
}

function matchSongMetaItems(song: MatchedSong): string[] {
  const bits: string[] = []
  const arranger = song.arranger?.trim()
  if (arranger) bits.push(arranger)
  if (song.voicing) bits.push(song.voicing)
  const key = song.key?.trim()
  if (key) bits.push(key)
  if (song.groupConfidence != null) bits.push(`confidence ${fmtConf(song.groupConfidence)}`)
  return bits
}

function isExpanded(id: string): boolean {
  return expandedIds.value.has(id)
}

type SongEditField = 'title' | 'arranger' | 'key' | 'voicing'
const songFieldEditing = ref<{ songId: string; field: SongEditField } | null>(null)

function isSongFieldEditing(songId: string, field: SongEditField): boolean {
  const cur = songFieldEditing.value
  return !!cur && cur.songId === songId && cur.field === field
}

function startSongFieldEdit(songId: string, field: SongEditField, ev?: Event): void {
  ev?.stopPropagation()
  const song = store.profile.songs.find((s) => s.id === songId)
  if (
    song &&
    isLibrarySourceLocked(song) &&
    (field === 'title' || field === 'arranger' || field === 'key')
  ) {
    return
  }
  songFieldEditing.value = { songId, field }
  void nextTick(() => {
    const el = document.querySelector(
      `[data-song-edit="${songId}-${field}"]`,
    ) as HTMLInputElement | HTMLSelectElement | null
    el?.focus()
    if (el && 'select' in el && typeof el.select === 'function' && el.tagName === 'INPUT') {
      el.select()
    }
  })
}

function stopSongFieldEdit(): void {
  songFieldEditing.value = null
}

function toggleExpand(id: string): void {
  const next = new Set(expandedIds.value)
  if (next.has(id)) {
    next.delete(id)
    if (linkPickerSongId.value === id) closeSongLinkPicker()
    if (songFieldEditing.value?.songId === id) stopSongFieldEdit()
  } else next.add(id)
  expandedIds.value = next
}

function commitQuickAdd(): void {
  const parsed = parseTitleField(quickTitle.value)
  // #region agent log
  fetch('http://127.0.0.1:7329/ingest/3e818d75-7333-4f02-b4aa-7062f01b9151',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eb58db'},body:JSON.stringify({sessionId:'eb58db',runId:'repro2',hypothesisId:'A',location:'SingTogetherView.vue:commitQuickAdd',message:'commitQuickAdd called',data:{titleLen:parsed.title.length,hasTitle:!!parsed.title,altCount:parsed.altTitles?.length??0,partCount:Object.keys(quickParts.value).length,parts:Object.fromEntries(Object.entries(quickParts.value)),songCountBefore:store.songCount,cursor:cursorKey(quickCursor.value)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!parsed.title) {
    setQuickCursor({ kind: 'title' })
    return
  }
  const voicing = quickVoicing.value || undefined
  const allowed = new Set(partsForVoicing(voicing))
  const parts: Record<string, Confidence> = {}
  for (const [id, conf] of Object.entries(quickParts.value)) {
    if (allowed.has(id)) parts[id] = conf
  }
  store.upsertSong({
    id: newSongId(),
    title: parsed.title,
    altTitles: parsed.altTitles,
    arranger: quickArranger.value.trim(),
    key: quickKey.value.trim() || undefined,
    voicing,
    parts,
    isTag: quickIsTag.value || undefined,
    tagId: quickLinkTagId.value ?? undefined,
    localEntryId: quickLinkEntryId.value ?? undefined,
  })
  // #region agent log
  fetch('http://127.0.0.1:7329/ingest/3e818d75-7333-4f02-b4aa-7062f01b9151',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eb58db'},body:JSON.stringify({sessionId:'eb58db',runId:'repro2',hypothesisId:'C',location:'SingTogetherView.vue:commitQuickAdd:after',message:'upsertSong done',data:{songCountAfter:store.songCount,lastTitle:store.profile.songs.at(-1)?.title??null,lastAlts:store.profile.songs.at(-1)?.altTitles??null,lastParts:store.profile.songs.at(-1)?.parts??null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  resetQuickAdd()
}

function onQuickKeydown(ev: KeyboardEvent): void {
  // #region agent log
  if (ev.key === 'Enter' || ev.key === 'Tab' || ev.key === ' ' || ev.key.startsWith('Arrow')) {
    fetch('http://127.0.0.1:7329/ingest/3e818d75-7333-4f02-b4aa-7062f01b9151',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eb58db'},body:JSON.stringify({sessionId:'eb58db',runId:'repro3',hypothesisId:'A',location:'SingTogetherView.vue:onQuickKeydown',message:'quick-add key',data:{key:ev.key,shift:ev.shiftKey,cursor:cursorKey(quickCursor.value),targetTag:(ev.target as HTMLElement)?.tagName??null,titleLen:quickTitle.value.length},timestamp:Date.now()})}).catch(()=>{});
  }
  // #endregion
  if (quickCursor.value.kind === 'tag' && ev.key === ' ') {
    ev.preventDefault()
    toggleQuickIsTag()
    return
  }
  if (quickCursor.value.kind === 'part-know' && ev.key === ' ') {
    ev.preventDefault()
    toggleQuickKnow(quickCursor.value.partId)
    return
  }
  if (quickCursor.value.kind === 'link') {
    const hits = quickLinkHits.value
    if (ev.key === 'ArrowDown' && hits.length) {
      ev.preventDefault()
      quickLinkHighlight.value =
        quickLinkHighlight.value < 0
          ? 0
          : Math.min(hits.length - 1, quickLinkHighlight.value + 1)
      return
    }
    if (ev.key === 'ArrowUp' && hits.length) {
      ev.preventDefault()
      quickLinkHighlight.value =
        quickLinkHighlight.value <= 0 ? hits.length - 1 : quickLinkHighlight.value - 1
      return
    }
    if (ev.key === 'Enter' && !ev.shiftKey && quickLinkHighlight.value >= 0) {
      const hit = hits[quickLinkHighlight.value]
      if (hit) {
        ev.preventDefault()
        pickQuickLink(hit)
        return
      }
    }
    if (ev.key === 'Escape' && (quickLinkLabel.value || quickLinkQuery.value)) {
      ev.preventDefault()
      ev.stopPropagation()
      clearQuickLink()
      seedQuickLinkQuery()
      return
    }
  }
  if (quickCursor.value.kind === 'part-rate') {
    if (ev.key >= '0' && ev.key <= '5') {
      ev.preventDefault()
      // #region agent log
      fetch('http://127.0.0.1:7329/ingest/3e818d75-7333-4f02-b4aa-7062f01b9151',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eb58db'},body:JSON.stringify({sessionId:'eb58db',runId:'repro4',hypothesisId:'H',location:'SingTogetherView.vue:onQuickKeydown',message:'digit rating',data:{key:ev.key,partId:quickCursor.value.partId},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setQuickPartConf(quickCursor.value.partId, Number(ev.key))
      return
    }
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') {
      ev.preventDefault()
      nudgeQuickPartConf(1)
      return
    }
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') {
      ev.preventDefault()
      nudgeQuickPartConf(-1)
      return
    }
  }
  if (ev.key === 'Enter') {
    ev.preventDefault()
    if (ev.shiftKey) commitQuickAdd()
    else advanceQuickStep()
    return
  }
  if (ev.key === 'Tab' && !ev.shiftKey) {
    ev.preventDefault()
    advanceQuickStep()
    return
  }
  if (ev.key === 'Tab' && ev.shiftKey) {
    const seq = quickSequence()
    const idx = seq.findIndex((c) => sameCursor(c, quickCursor.value))
    if (idx > 0) {
      ev.preventDefault()
      setQuickCursor(seq[idx - 1]!)
    }
  }
}

function removeSong(id: string): void {
  store.removeSong(id)
  const next = new Set(expandedIds.value)
  next.delete(id)
  expandedIds.value = next
  if (linkPickerSongId.value === id) closeSongLinkPicker()
  if (selectedIds.value.has(id)) {
    const sel = new Set(selectedIds.value)
    sel.delete(id)
    selectedIds.value = sel
  }
}

const pendingDeleteIds = ref<string[] | null>(null)

const pendingDeleteMessage = computed(() => {
  const ids = pendingDeleteIds.value
  if (!ids?.length) return 'Are you sure you want to remove this song from your repertoire?'
  if (ids.length === 1) {
    const song = store.profile.songs.find((s) => s.id === ids[0])
    const title = song?.title.trim() || 'this song'
    return `Are you sure you want to remove “${title}” from your repertoire?`
  }
  return `Are you sure you want to remove ${ids.length} songs from your repertoire?`
})

function requestRemoveSong(song: RepertoireSong, ev?: Event): void {
  ev?.stopPropagation()
  pendingDeleteIds.value = [song.id]
}

function requestRemoveSelected(): void {
  const ids = [...selectedIds.value]
  if (!ids.length) return
  pendingDeleteIds.value = ids
}

function cancelRemoveSong(): void {
  pendingDeleteIds.value = null
}

function confirmRemoveSong(): void {
  const ids = pendingDeleteIds.value
  pendingDeleteIds.value = null
  if (!ids?.length) return
  for (const id of ids) removeSong(id)
  clearSelection()
}

function patchSong(song: RepertoireSong, patch: Partial<RepertoireSong>): void {
  store.upsertSong({ ...song, ...patch })
}

function onSongTitle(song: RepertoireSong, ev: Event): void {
  const parsed = parseTitleField((ev.target as HTMLInputElement).value)
  patchSong(song, { title: parsed.title, altTitles: parsed.altTitles })
}

function commitSongTitle(song: RepertoireSong, ev: Event): void {
  if (!isSongFieldEditing(song.id, 'title')) return
  onSongTitle(song, ev)
  stopSongFieldEdit()
}

function onSongArranger(song: RepertoireSong, ev: Event): void {
  const arranger = (ev.target as HTMLInputElement).value
  patchSong(song, { arranger })
}

function commitSongArranger(song: RepertoireSong, ev: Event): void {
  if (!isSongFieldEditing(song.id, 'arranger')) return
  onSongArranger(song, ev)
  stopSongFieldEdit()
}

function onSongKey(song: RepertoireSong, ev: Event): void {
  const raw = (ev.target as HTMLSelectElement).value.trim()
  patchSong(song, { key: raw || undefined })
  stopSongFieldEdit()
}

function onSongVoicing(song: RepertoireSong, ev: Event): void {
  const raw = (ev.target as HTMLSelectElement).value
  const voicing = raw ? (raw as Voicing) : undefined
  patchSong(song, { voicing, parts: {} })
  stopSongFieldEdit()
}

function songPartConfidence(song: RepertoireSong, partId: string): Confidence | null {
  return Object.prototype.hasOwnProperty.call(song.parts, partId)
    ? (song.parts[partId] ?? 0)
    : null
}

function setSongPartConfidence(
  song: RepertoireSong,
  partId: string,
  value: Confidence | null,
): void {
  store.setPartConfidence(song.id, partId, value)
}

/** Bulk presets: off book = memorized (5★), on book = with music (3★). */
function applyAllParts(song: RepertoireSong, mode: 'off-book' | 'on-book' | 'clear'): void {
  if (mode === 'clear') {
    patchSong(song, { parts: {} })
    return
  }
  const conf: Confidence = mode === 'off-book' ? 5 : 3
  const parts: Record<string, Confidence> = {}
  for (const pid of partsForVoicing(song.voicing)) {
    parts[pid] = conf
  }
  patchSong(song, { parts })
}

function onCsvImport(text: string): void {
  const result = store.importCsv(text)
  snackbar.show(
    result.added
      ? `Imported ${result.added} song${result.added === 1 ? '' : 's'}${
          result.skipped ? ` (${result.skipped} skipped)` : ''
        }`
      : `No songs imported${result.skipped ? ` (${result.skipped} skipped)` : ''}`,
    {
      tone: result.added ? 'ok' : 'info',
      ms: 3500,
      title: 'CSV import',
    },
  )
}

function onPasteSongs(text: string, columns: RepertoireCsvColumn[]): void {
  // #region agent log
  fetch('http://127.0.0.1:7329/ingest/3e818d75-7333-4f02-b4aa-7062f01b9151',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eb58db'},body:JSON.stringify({sessionId:'eb58db',runId:'repro8',hypothesisId:'P',location:'SingTogetherView.vue:onPasteSongs',message:'paste songs',data:{cols:columns,textLen:text.length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  const result = store.importPaste(text, columns)
  if (!result.added && !result.duplicates) {
    snackbar.show('No songs to add', { tone: 'info', ms: 2500, title: 'Paste songs' })
    return
  }
  const bits: string[] = []
  if (result.added) {
    bits.push(`Added ${result.added} song${result.added === 1 ? '' : 's'}`)
  }
  if (result.duplicates) {
    bits.push(`${result.duplicates} duplicate${result.duplicates === 1 ? '' : 's'} skipped`)
  }
  if (result.skipped) {
    bits.push(`${result.skipped} row${result.skipped === 1 ? '' : 's'} skipped`)
  }
  snackbar.show(bits.join('; '), {
    tone: result.added ? 'ok' : 'info',
    ms: result.added ? 6000 : 4000,
    title: 'Paste songs',
    action: result.added
      ? {
          label: 'Show my QR',
          onClick: () => setMode('qr'),
        }
      : undefined,
  })
}

function dismissQrNudge(): void {
  qrNudgeLatch.value = false
  qrNudgeSeen.value = true
  saveQrNudgeSeen(true)
}

function openCsvImport(): void {
  closeImportMenu()
  csvImportOpen.value = true
}

function openPasteSongs(): void {
  closeImportMenu()
  pasteTitlesOpen.value = true
}

function openLibraryImport(): void {
  closeImportMenu()
  void localLib.ensureLoaded()
  libraryImportOpen.value = true
}

function closeImportMenu(): void {
  importMenuOpen.value = false
}

function toggleImportMenu(): void {
  importMenuOpen.value = !importMenuOpen.value
}

function onImportMenuDocPointer(e: PointerEvent): void {
  if (!importMenuOpen.value) return
  const root = importMenuRef.value
  if (root && !root.contains(e.target as Node)) closeImportMenu()
}

watch(importMenuOpen, (open, _prev, onCleanup) => {
  if (!open) return
  document.addEventListener('pointerdown', onImportMenuDocPointer, true)
  onCleanup(() => {
    document.removeEventListener('pointerdown', onImportMenuDocPointer, true)
  })
})

function onLibraryImport(drafts: LibraryImportDraft[]): void {
  const result = store.importFromLibrary(drafts)
  if (!result.added && !result.duplicates) {
    snackbar.show('No songs imported', { tone: 'info', ms: 2500, title: 'My Library' })
    return
  }
  const bits: string[] = []
  if (result.added) bits.push(`Added ${result.added}`)
  if (result.duplicates) bits.push(`${result.duplicates} already linked`)
  snackbar.show(bits.join(' · '), {
    tone: result.added ? 'ok' : 'info',
    ms: 3500,
    title: 'Import from My Library',
  })
}

function openQuickAdd(): void {
  if (quickAddOpen.value) {
    void nextTick(() => focusQuickCursor())
    return
  }
  quickAddOpen.value = true
  resetQuickAdd()
}

function toggleQuickAdd(): void {
  if (quickAddOpen.value) closeQuickAdd()
  else openQuickAdd()
}

function closeQuickAdd(): void {
  quickAddOpen.value = false
}

const qrSrc = ref('')
const qrBusy = ref(false)
const qrError = ref<string | null>(null)
const enlargeOpen = ref(false)
/** Ignores stale async QR builds while the display name is typed quickly. */
let qrRefreshGen = 0

const hostPeople = ref<RosterPerson[]>([])
const hostScanning = ref(false)
const matchOptionsOpen = ref(false)
const scanFlash = ref<string | null>(null)
const sortMode = ref<MatchSort>(DEFAULT_MATCH_SORT)
const minPartsFilter = ref<MinPartsFilter>(DEFAULT_MIN_PARTS_FILTER)
const textMode = ref<TextMatchMode>('fuzzy')
const matchCriteria = ref({
  arranger: DEFAULT_MATCH_CRITERIA.arranger,
  voicing: DEFAULT_MATCH_CRITERIA.voicing,
  parts: DEFAULT_MATCH_CRITERIA.parts,
})

let lastScanFingerprint = ''
let scanFlashTimer: number | null = null

const cap = computed(() => capacityInfo(store.profile))
const absMax = QR_MAX_BYTES

const matchedAll = computed(() => {
  const people: RosterPerson[] = [
    { id: 'host', profile: store.profile },
    ...hostPeople.value,
  ]
  if (people.length < 2) return []
  const criteria: Partial<MatchCriteria> = {
    arranger: matchCriteria.value.arranger,
    voicing: matchCriteria.value.voicing,
    parts: matchCriteria.value.parts,
  }
  return matchRepertoires(people, {
    criteria,
    textMode: textMode.value,
  })
})

const matched = computed(() =>
  sortMatchedSongs(filterMatchedSongs(matchedAll.value, minPartsFilter.value), sortMode.value),
)

const coverableCount = computed(() => matchedAll.value.filter((m) => m.coverable).length)
const filteredOutCount = computed(() => matchedAll.value.length - matched.value.length)

watch(
  () => [mode.value, store.profile] as const,
  () => {
    if (mode.value === 'qr') void refreshQr()
  },
  { deep: true },
)

watch(mode, (m) => {
  if (m !== 'host') {
    closeHostScan()
    closeMatchOptions()
  }
})

onUnmounted(() => {
  narrowMq?.removeEventListener('change', syncNarrowSelect)
  narrowMq = null
  if (longPressTimer != null) clearTimeout(longPressTimer)
  closeHostScan()
  if (scanFlashTimer != null) window.clearTimeout(scanFlashTimer)
  window.removeEventListener(PITCH_PIPE_VOICE_CHANGE_EVENT, syncPitchVoice)
  pitchPlayer.stop()
  pitchPlayer.dispose()
})

function setMode(m: Mode): void {
  mode.value = m
  if (m === 'qr') {
    dismissQrNudge()
    void nextTick(() => {
      if (!store.profile.displayName.trim()) displayNameEl.value?.focus()
    })
  }
}

async function refreshQr(): Promise<void> {
  const gen = ++qrRefreshGen
  qrBusy.value = true
  qrError.value = null
  try {
    // #region agent log
    fetch('http://127.0.0.1:7329/ingest/3e818d75-7333-4f02-b4aa-7062f01b9151',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eb58db'},body:JSON.stringify({sessionId:'eb58db',runId:'repro1',hypothesisId:'E',location:'SingTogetherView.vue:refreshQr',message:'refreshQr start',data:{gen,nameLen:store.profile.displayName.length,songCount:store.songCount,usedBytes:cap.value.usedBytes,fitVersion:cap.value.fit?.version??null,fitEcc:cap.value.fit?.ecc??null,critical:cap.value.critical,hasFit:!!cap.value.fit},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (cap.value.critical && !cap.value.fit) {
      if (gen !== qrRefreshGen) return
      qrSrc.value = ''
      qrError.value = `Too large for one QR (${cap.value.usedBytes} / ${absMax} B). Remove songs.`
      // #region agent log
      fetch('http://127.0.0.1:7329/ingest/3e818d75-7333-4f02-b4aa-7062f01b9151',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eb58db'},body:JSON.stringify({sessionId:'eb58db',runId:'repro1',hypothesisId:'E',location:'SingTogetherView.vue:refreshQr:critical',message:'blocked as critical no fit',data:{usedBytes:cap.value.usedBytes,absMax},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return
    }
    const { dataUrl } = await encodeProfileQr(store.profile, 512)
    if (gen !== qrRefreshGen) return
    qrSrc.value = dataUrl
    qrError.value = null
  } catch (e) {
    if (gen !== qrRefreshGen) return
    qrSrc.value = ''
    qrError.value = e instanceof Error ? e.message : 'Could not build QR'
    // #region agent log
    fetch('http://127.0.0.1:7329/ingest/3e818d75-7333-4f02-b4aa-7062f01b9151',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eb58db'},body:JSON.stringify({sessionId:'eb58db',runId:'repro1',hypothesisId:'E',location:'SingTogetherView.vue:refreshQr:catch',message:'encode failed',data:{err:e instanceof Error?e.message:String(e)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  } finally {
    if (gen === qrRefreshGen) qrBusy.value = false
  }
}

function flashScanMessage(message: string): void {
  scanFlash.value = message
  if (scanFlashTimer != null) window.clearTimeout(scanFlashTimer)
  scanFlashTimer = window.setTimeout(() => {
    scanFlash.value = null
    scanFlashTimer = null
  }, 1600)
}

function openHostScan(): void {
  closeMatchOptions()
  scanFlash.value = null
  lastScanFingerprint = ''
  hostScanning.value = true
}

function closeHostScan(): void {
  hostScanning.value = false
  scanFlash.value = null
  if (scanFlashTimer != null) {
    window.clearTimeout(scanFlashTimer)
    scanFlashTimer = null
  }
}

function toggleMatchOptions(): void {
  matchOptionsOpen.value = !matchOptionsOpen.value
}

function closeMatchOptions(): void {
  matchOptionsOpen.value = false
}

function onHostScanError(message: string): void {
  snackbar.show(message, { tone: 'info', ms: 3000 })
}

function ingestScan(result: QrDecodeResult): void {
  let profile
  try {
    profile = decodeProfileFromQr(result)
  } catch {
    return
  }
  const fp =
    (result.bytes ? Array.from(result.bytes.slice(0, 32)).join(',') : '') +
    '|' +
    (profile.displayName || '') +
    '|' +
    profile.songs.length
  if (fp === lastScanFingerprint) return
  lastScanFingerprint = fp

  const name = profile.displayName.trim() || `Singer ${hostPeople.value.length + 1}`
  const existing = hostPeople.value.findIndex(
    (p) =>
      p.profile.displayName.trim().toLowerCase() === name.toLowerCase() &&
      p.profile.songs.length === profile.songs.length,
  )
  const person: RosterPerson = {
    id: existing >= 0 ? hostPeople.value[existing]!.id : `peer-${Date.now()}`,
    profile: { ...profile, displayName: name },
  }
  if (existing >= 0) {
    const next = [...hostPeople.value]
    next[existing] = person
    hostPeople.value = next
  } else {
    hostPeople.value = [...hostPeople.value, person]
  }
  const n = profile.songs.length
  flashScanMessage(`${name} songs captured`)
  if (!hostScanning.value) {
    snackbar.show(
      `${name}: ${n} song${n === 1 ? '' : 's'}`,
      { tone: 'ok', ms: 2500 },
    )
  }
}

function removePerson(id: string): void {
  hostPeople.value = hostPeople.value.filter((p) => p.id !== id)
}

function coverageParts(song: MatchedSong): {
  id: string
  label: string
  count: number
  names: string
}[] {
  return partsForVoicing(song.voicing).map((p) => {
    const people = song.coverage[p] ?? []
    return {
      id: p,
      label: partLabel(p),
      count: people.length,
      names: people.map((x) => x.displayName).join(', '),
    }
  })
}

function fmtConf(n: number): string {
  return n.toFixed(1)
}
</script>

<template>
  <section class="st" :class="{ 'has-selection': selectedIds.size > 0 }" aria-label="Sing Together">
    <header class="st-head">
      <h1 class="st-title">Sing Together</h1>
      <p class="st-intro">
        List songs → show your QR → scan for matches. Titles are enough to start; parts and
        arranger can wait.
      </p>
    </header>

    <div class="ctrl-tabs st-tabs" role="tablist" aria-label="Sing Together modes">
      <button
        type="button"
        class="ctrl-tab"
        role="tab"
        :aria-selected="mode === 'repertoire'"
        @click="setMode('repertoire')"
      >
        Repertoire
      </button>
      <button
        type="button"
        class="ctrl-tab"
        role="tab"
        :aria-selected="mode === 'qr'"
        @click="setMode('qr')"
      >
        My QR
      </button>
      <button
        type="button"
        class="ctrl-tab"
        role="tab"
        :aria-selected="mode === 'host'"
        @click="setMode('host')"
      >
        Scan for matches
      </button>
    </div>

    <!-- Repertoire -->
    <div v-show="mode === 'repertoire'" role="tabpanel" aria-label="Repertoire">
      <div class="repertoire-toolbar">
        <button
          type="button"
          class="btn toggle"
          :class="{ on: quickAddOpen }"
          :aria-pressed="quickAddOpen"
          :aria-expanded="quickAddOpen"
          :aria-controls="quickAddOpen ? 'quick-add-panel' : undefined"
          @click="toggleQuickAdd"
        >
          Add to Repertoire
        </button>
        <button type="button" class="btn" @click="manageCollectionsOpen = true">
          Manage collections
        </button>
        <div ref="importMenuRef" class="import-menu-wrap">
          <button
            type="button"
            class="btn btn-ghost"
            :class="{ on: importMenuOpen }"
            aria-haspopup="menu"
            :aria-expanded="importMenuOpen"
            aria-controls="repertoire-import-menu"
            @click="toggleImportMenu"
          >
            Import
          </button>
          <div
            v-if="importMenuOpen"
            id="repertoire-import-menu"
            class="import-menu"
            role="menu"
            aria-label="Import songs"
          >
            <button
              type="button"
              role="menuitem"
              class="import-menu-item"
              @click="openPasteSongs"
            >
              from Clipboard
            </button>
            <button type="button" role="menuitem" class="import-menu-item" @click="openCsvImport">
              from CSV
            </button>
            <button
              v-if="libraryEnabled"
              type="button"
              role="menuitem"
              class="import-menu-item"
              @click="openLibraryImport"
            >
              from My Library
            </button>
          </div>
        </div>
      </div>
      <div
        v-if="quickAddOpen"
        id="quick-add-panel"
        class="quick-add-panel"
        role="region"
        aria-label="Add to repertoire"
        @keydown.escape.prevent="closeQuickAdd"
      >
        <div
          class="quick-add"
          role="group"
          aria-label="Quick add song"
          @keydown="onQuickKeydown"
        >
          <div class="quick-chips" role="list" aria-label="Song fields">
            <button
              v-for="kind in CHIP_KINDS"
              :key="kind"
              type="button"
              role="listitem"
              class="quick-chip"
              :class="{
                filled: chipFilled(kind),
                ghost: !chipFilled(kind),
                active: kind === currentChipKind(),
              }"
              :disabled="!chipUnlocked(kind)"
              :aria-current="kind === currentChipKind() ? 'step' : undefined"
              :title="chipUnlocked(kind) ? `Edit ${CHIP_LABEL[kind]}` : `${CHIP_LABEL[kind]} (later)`"
              @click="goChip(kind)"
            >
              <span class="quick-chip-k">{{ CHIP_LABEL[kind] }}</span>
              <span class="quick-chip-v">{{ chipLabel(kind) }}</span>
            </button>
          </div>

          <div class="quick-add-row">
            <div v-if="quickCursor.kind === 'title'" class="quick-field quick-field-active">
              <span class="field-label">Title</span>
              <div
                class="quick-title-box"
                role="group"
                aria-label="Title and alternate names"
                @click="quickTitleEl?.focus()"
              >
                <span
                  v-for="(pill, i) in quickTitlePills"
                  :key="`${i}-${pill}`"
                  class="title-pill"
                  :class="{ primary: i === 0 }"
                >
                  <span class="title-pill-text">{{ pill }}</span>
                  <button
                    type="button"
                    class="title-pill-x"
                    :aria-label="i === 0 ? `Remove title ${pill}` : `Remove AKA ${pill}`"
                    @click.stop="removeTitlePill(i)"
                  >
                    ×
                  </button>
                </span>
                <input
                  ref="quickTitleEl"
                  v-model="quickTitleDraft"
                  type="text"
                  maxlength="200"
                  autocomplete="off"
                  class="quick-title-draft"
                  :placeholder="
                    quickTitlePills.length
                      ? 'Alternate Title; Another Alternate'
                      : 'Full Title; Alternate Title; Another Alternate'
                  "
                  @input="onQuickTitleDraftInput"
                  @keydown="onQuickTitleTokenKeydown"
                />
              </div>
            </div>
            <label
              v-else-if="quickCursor.kind === 'arranger'"
              class="quick-field quick-field-active"
            >
              <span class="field-label">Arranger</span>
              <input
                ref="quickArrangerEl"
                v-model="quickArranger"
                type="text"
                maxlength="80"
                autocomplete="off"
                placeholder="Optional — Tab to skip"
              />
            </label>
            <div
              v-else-if="quickCursor.kind === 'tag'"
              class="quick-field quick-field-active quick-know"
            >
              <span class="field-label">Catalog tag?</span>
              <button
                ref="quickTagEl"
                type="button"
                class="sel-btn quick-know-btn"
                :class="{ on: quickIsTag }"
                :aria-pressed="quickIsTag"
                aria-label="Catalog tag"
                title="Checked = SingTags catalog; unchecked = My Library song"
                @click="toggleQuickIsTag"
              >
                {{ quickIsTag ? '✓' : '' }}
              </button>
            </div>
            <div
              v-else-if="quickCursor.kind === 'part-know'"
              class="quick-field quick-field-active quick-know"
            >
              <span class="field-label">Know {{ partLabel(quickCursor.partId) }}?</span>
              <button
                ref="quickKnowEl"
                type="button"
                class="sel-btn quick-know-btn"
                :class="{ on: knowsQuickPart(quickCursor.partId) }"
                :aria-pressed="knowsQuickPart(quickCursor.partId)"
                :aria-label="`Know ${partLabel(quickCursor.partId)}`"
                @click="toggleQuickKnow(quickCursor.partId)"
              >
                {{ knowsQuickPart(quickCursor.partId) ? '✓' : '' }}
              </button>
            </div>
            <div
              v-else-if="quickCursor.kind === 'part-rate'"
              class="quick-field quick-field-active quick-rate-wrap"
            >
              <span class="field-label">Rate how well</span>
              <div
                ref="quickRateEl"
                class="quick-rate"
                role="slider"
                tabindex="0"
                :aria-label="`Rate ${partLabel(quickCursor.partId)}`"
                :aria-valuemin="0"
                :aria-valuemax="5"
                :aria-valuenow="quickParts[quickCursor.partId] ?? 0"
                :aria-valuetext="
                  (quickParts[quickCursor.partId] ?? 0) === 0
                    ? 'Not rated'
                    : `${quickParts[quickCursor.partId]} star${(quickParts[quickCursor.partId] ?? 0) === 1 ? '' : 's'}`
                "
                @pointerleave="setQuickRateHover(null)"
              >
                <button
                  v-for="n in 5"
                  :key="n"
                  type="button"
                  class="quick-star"
                  :class="{ on: n <= quickRatePreview(quickCursor.partId) }"
                  tabindex="-1"
                  :aria-label="`${n} star${n === 1 ? '' : 's'}`"
                  :aria-pressed="(quickParts[quickCursor.partId] ?? 0) === n"
                  @pointerenter="setQuickRateHover(n)"
                  @focus="setQuickRateHover(n)"
                  @click="setQuickPartConf(quickCursor.partId, n === (quickParts[quickCursor.partId] ?? 0) ? 0 : n)"
                >
                  ★
                </button>
                <button
                  v-if="(quickParts[quickCursor.partId] ?? 0) > 0"
                  type="button"
                  class="quick-star-clear"
                  tabindex="-1"
                  title="Clear rating"
                  @pointerenter="setQuickRateHover(null)"
                  @click="setQuickPartConf(quickCursor.partId, 0)"
                >
                  Clear
                </button>
              </div>
            </div>
            <label v-else-if="quickCursor.kind === 'key'" class="quick-field quick-field-active">
              <span class="field-label">Key</span>
              <select ref="quickKeyEl" v-model="quickKey">
                <option v-for="k in quickKeyOptions" :key="k || 'none'" :value="k">
                  {{ localLibraryKeyLabel(k) }}
                </option>
              </select>
            </label>
            <label
              v-else-if="quickCursor.kind === 'voicing'"
              class="quick-field quick-field-active"
            >
              <span class="field-label">Voicing</span>
              <select ref="quickVoicingEl" v-model="quickVoicing" @change="onQuickVoicingChange">
                <option value="">Unspecified</option>
                <option v-for="v in VOICINGS" :key="v" :value="v">{{ v }}</option>
              </select>
            </label>
            <div
              v-else-if="quickCursor.kind === 'link'"
              class="quick-field quick-field-active quick-link-field"
            >
              <span class="field-label">{{
                quickIsTag ? 'Link tag' : 'Link My Library'
              }}</span>
              <div class="quick-link-box">
                <input
                  ref="quickLinkEl"
                  v-model="quickLinkQuery"
                  type="search"
                  maxlength="120"
                  autocomplete="off"
                  :placeholder="
                    quickIsTag ? 'Search catalog tags…' : 'Search My Library…'
                  "
                  :aria-label="quickIsTag ? 'Search catalog tags' : 'Search My Library'"
                  @input="onQuickLinkQueryInput"
                />
                <button
                  v-if="quickLinkLabel || quickLinkQuery"
                  type="button"
                  class="quick-link-clear"
                  title="Clear link"
                  aria-label="Clear link"
                  @click="clearQuickLink(); seedQuickLinkQuery()"
                >
                  ×
                </button>
                <ul
                  v-if="quickLinkHits.length && !quickLinkLabel"
                  class="quick-link-dropdown"
                  role="listbox"
                  :aria-label="quickIsTag ? 'Tag matches' : 'Library matches'"
                >
                  <li
                    v-for="(hit, i) in quickLinkHits"
                    :key="hit.kind === 'tag' ? `t-${hit.id}` : `l-${hit.id}`"
                  >
                    <button
                      type="button"
                      role="option"
                      :class="{ active: i === quickLinkHighlight }"
                      :aria-selected="i === quickLinkHighlight"
                      @pointerenter="quickLinkHighlight = i"
                      @click="pickQuickLink(hit)"
                    >
                      <span>{{ hit.title }}</span>
                      <span v-if="hit.kind === 'tag'" class="muted">#{{ hit.id }}</span>
                      <span v-else-if="hit.arranger" class="muted">{{ hit.arranger }}</span>
                    </button>
                  </li>
                </ul>
                <p
                  v-else-if="
                    quickLinkQuery.trim() && !quickLinkLabel && !quickLinkHits.length
                  "
                  class="hint muted quick-link-empty"
                >
                  No matches
                </p>
                <p
                  v-else-if="!quickIsTag && !libraryEnabled"
                  class="hint muted quick-link-empty"
                >
                  My Library is off — enable it in Labs, or mark Tag
                </p>
              </div>
            </div>

            <div class="quick-nav" role="group" aria-label="Quick add navigation">
              <button
                type="button"
                class="quick-nav-icon"
                :disabled="quickCursor.kind === 'title'"
                aria-label="Previous field"
                title="Previous"
                @click="retreatQuickStep"
              >
                ‹
              </button>
              <button
                type="button"
                class="quick-nav-icon"
                aria-label="Next field"
                title="Next"
                @click="advanceQuickStep"
              >
                ›
              </button>
              <button
                type="button"
                class="quick-nav-icon quick-nav-done"
                :disabled="!parseTitleField(quickTitle).title"
                aria-label="Add song"
                title="Add song"
                @click="commitQuickAdd"
              >
                ✓
              </button>
            </div>
          </div>
          <p class="hint quick-hint">
            Enter / Tab next. Shift+Enter or ✓ add. Link last (↑↓ pick). Tag / Know? ✓. 0–5 stars
          </p>
        </div>
      </div>

      <p v-if="showQrNudge" class="qr-nudge" role="status">
        <span>Next: open My QR and set your name.</span>
        <button type="button" class="linkish" @click="setMode('qr')">Show my QR</button>
        <button type="button" class="nudge-dismiss" aria-label="Dismiss" @click="dismissQrNudge">
          ✕
        </button>
      </p>


      <div
        v-if="store.songCount && store.collections.length"
        class="collection-bar"
        role="toolbar"
        aria-label="Collections"
      >
        <button
          type="button"
          class="chip"
          :class="{ on: !activeCollectionId }"
          :aria-pressed="!activeCollectionId"
          @click="selectCollection(null)"
        >
          All
          <span class="chip-n">{{ store.songCount }}</span>
        </button>
        <div class="collection-strip" :class="{ paged: showCollectionPager }">
          <button
            v-if="showCollectionPager"
            type="button"
            class="collection-strip-nav"
            :disabled="collectionPage <= 0"
            aria-label="Previous collections"
            @click="collectionPage -= 1"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <div ref="collectionStripHost" class="collection-strip-body">
            <div ref="collectionMeasureEl" class="collection-measure" aria-hidden="true">
              <span v-for="c in collectionChips" :key="c.id" class="chip">
                {{ c.name }}
                <span class="chip-n">{{ collectionCounts[c.id] ?? 0 }}</span>
              </span>
            </div>
            <div class="collection-page" aria-label="Collection page">
              <button
                v-for="c in pagedCollectionChips"
                :key="c.id"
                type="button"
                class="chip"
                :class="{ on: activeCollectionId === c.id }"
                :aria-pressed="activeCollectionId === c.id"
                @click="selectCollection(c.id)"
              >
                <CustomCollectionMark />
                {{ c.name }}
                <span class="chip-n">{{ collectionCounts[c.id] ?? 0 }}</span>
              </button>
            </div>
          </div>
          <button
            v-if="showCollectionPager"
            type="button"
            class="collection-strip-nav"
            :disabled="collectionPage >= collectionPageCount - 1"
            aria-label="Next collections"
            @click="collectionPage += 1"
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </div>

      <div class="songs-block">
        <div v-if="store.songCount" class="search-toolbar">
          <div class="search-field">
            <input
              v-model="repertoireSearch"
              type="search"
              enterkeyhint="search"
              autocomplete="off"
              autocorrect="off"
              spellcheck="false"
              placeholder="Search titles, AKA, arrangers…"
              aria-label="Search repertoire"
            />
            <div class="search-infield">
              <button
                v-if="repertoireSearch"
                type="button"
                class="icon-btn clear-infield"
                aria-label="Clear search"
                title="Clear search"
                @click="repertoireSearch = ''"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
        <div class="list-head results-meta" aria-live="polite">
          <div id="song-list-h" class="text-muted count">{{ repertoireCountLabel }}</div>
          <div class="list-controls">
            <div v-if="store.songCount" class="list-sort">
              <label class="sort-field" title="Order repertoire">
                <span class="sort-lbl">Sort</span>
                <select
                  v-model="repertoireSort"
                  aria-label="Sort repertoire"
                  @change="($event.target as HTMLSelectElement).blur()"
                >
                  <option value="custom">Custom order</option>
                  <option value="title">Title</option>
                  <option value="arranger">Arranger</option>
                  <option value="parts">Parts marked</option>
                </select>
              </label>
              <button
                type="button"
                class="sort-rev"
                :class="{ on: repertoireSortReverse }"
                :aria-pressed="repertoireSortReverse"
                :title="sortReverseTip()"
                aria-label="Reverse view order"
                @click="repertoireSortReverse = !repertoireSortReverse"
              >
                ⇅
              </button>
            </div>
            <div
              v-if="needsDetailsCount"
              class="ctrl-segment list-filter"
              role="group"
              aria-label="Filter songs"
            >
              <button
                type="button"
                :aria-pressed="listFilter === 'all'"
                @click="listFilter = 'all'"
              >
                All
              </button>
              <button
                type="button"
                :aria-pressed="listFilter === 'needs-details'"
                @click="listFilter = 'needs-details'"
              >
                Incomplete ({{ needsDetailsCount }})
              </button>
            </div>
          </div>
        </div>
        <ul
          v-if="displayedSongs.length"
          class="list"
          :class="listDraggingClass"
          aria-label="Repertoire songs"
        >
          <li
            v-for="(song, i) in displayedSongs"
            :key="song.id"
            class="list-row"
            :data-index="i"
            :class="{
              expanded: isExpanded(song.id),
              'show-select': showRowSelect,
              ...rowDragClass(song.id, i),
            }"
            @pointerenter="onDragEnter($event, i)"
            @pointerdown="onRowPointerDown($event, song.id)"
            @pointermove="onRowPointerMove"
            @pointerup="onRowPointerEnd"
            @pointercancel="onRowPointerEnd"
            @click.capture="onRowClickCapture"
          >
            <button
              v-if="canReorder"
              type="button"
              class="drag-handle"
              :aria-label="`Drag ${song.title || 'song'} to reorder`"
              aria-roledescription="sortable"
              @pointerdown="onHandlePointerDown($event, song.id, i)"
            >
              ⠿
            </button>
            <button
              v-if="showRowSelect"
              type="button"
              class="sel-btn"
              :class="{ on: selectedIds.has(song.id) }"
              :aria-pressed="selectedIds.has(song.id)"
              :aria-label="`Select ${song.title || 'song'}`"
              @click.stop="toggleSelect(song.id)"
            >
              {{ selectedIds.has(song.id) ? '✓' : '' }}
            </button>
            <button
              type="button"
              class="row-link"
              :aria-expanded="isExpanded(song.id)"
              :aria-label="`Edit ${song.title || 'song'}`"
              @click="toggleExpand(song.id)"
            >
              <span class="row-flow">
                <span class="title-text">{{ song.title || '(untitled)' }}</span>
                <span v-if="song.arranger?.trim()" class="flow-bit">{{ song.arranger.trim() }}</span>
                <span v-if="songAkaLabel(song)" class="flow-bit aka">{{ songAkaLabel(song) }}</span>
                <span v-if="songVoicingLabel(song)" class="flow-bit">{{ songVoicingLabel(song) }}</span>
                <span v-if="songKeyLabel(song)" class="flow-bit">{{ songKeyLabel(song) }}</span>
                <span v-if="song.isTag" class="row-badge">Tag</span>
                <span v-if="songNeedsDetails(song)" class="row-badge muted">Incomplete</span>
                <span
                  v-if="songPartMetaItems(song).length"
                  class="flow-parts"
                >
                  <span
                    v-for="(part, i) in songPartMetaItems(song)"
                    :key="`${song.id}-part-${i}`"
                    class="flow-bit"
                  >{{ part }}</span>
                </span>
              </span>
            </button>
            <button
              v-if="songOpenTarget(song)"
              type="button"
              class="row-open"
              :aria-label="songOpenLabel(song)"
              :title="songOpenLabel(song)"
              @click="openSongPage(song, $event)"
            >
              Open
            </button>
            <button
              type="button"
              class="row-remove"
              :aria-label="`Remove ${song.title || 'song'} from repertoire`"
              title="Remove from repertoire"
              @click="requestRemoveSong(song, $event)"
            >
              ×
            </button>
            <div v-if="isExpanded(song.id)" class="song-edit">
              <div v-if="songCanPitch(song)" class="edit-pitch">
                <PitchControls
                  :model-value="songShiftSemitones(song.id)"
                  :pitch-label="songPitchShiftLabel(song)"
                  pay-key-enabled
                  @update:model-value="setSongPitch(song.id, $event)"
                  @pay-down="paySongPitchDown(song)"
                  @pay-up="paySongPitchUp()"
                />
              </div>
              <div class="edit-fact edit-fact-title">
                <span class="edit-lbl">Title</span>
                <template v-if="!isLibrarySourceLocked(song) && isSongFieldEditing(song.id, 'title')">
                  <input
                    :data-song-edit="`${song.id}-title`"
                    class="edit-input edit-input-title"
                    :value="formatTitleField(song)"
                    type="text"
                    maxlength="200"
                    autocomplete="off"
                    placeholder="Full Title; Alternate Title"
                    aria-label="Title"
                    @change="commitSongTitle(song, $event)"
                    @blur="commitSongTitle(song, $event)"
                    @keydown.enter.prevent="commitSongTitle(song, $event)"
                    @keydown.escape.prevent="stopSongFieldEdit"
                  />
                </template>
                <template v-else>
                  <span class="edit-body">
                    <span
                      class="edit-val"
                      :title="
                        isLibrarySourceLocked(song)
                          ? 'Synced from My Library — unlink to edit'
                          : undefined
                      "
                    >{{ formatTitleField(song) || '—' }}</span>
                    <button
                      v-if="!isLibrarySourceLocked(song)"
                      type="button"
                      class="edit-icon"
                      aria-label="Edit title"
                      title="Edit title"
                      @click="startSongFieldEdit(song.id, 'title', $event)"
                    >
                      ✎
                    </button>
                  </span>
                </template>
              </div>

              <div class="edit-meta">
                <div class="edit-fact">
                  <span class="edit-lbl">Arranger</span>
                  <template
                    v-if="!isLibrarySourceLocked(song) && isSongFieldEditing(song.id, 'arranger')"
                  >
                    <input
                      :data-song-edit="`${song.id}-arranger`"
                      class="edit-input"
                      :value="song.arranger"
                      type="text"
                      maxlength="80"
                      autocomplete="off"
                      aria-label="Arranger"
                      @change="commitSongArranger(song, $event)"
                      @blur="commitSongArranger(song, $event)"
                      @keydown.enter.prevent="commitSongArranger(song, $event)"
                      @keydown.escape.prevent="stopSongFieldEdit"
                    />
                  </template>
                  <template v-else>
                    <span class="edit-body">
                      <span class="edit-val">{{ song.arranger.trim() || '—' }}</span>
                      <button
                        v-if="!isLibrarySourceLocked(song)"
                        type="button"
                        class="edit-icon"
                        aria-label="Edit arranger"
                        title="Edit arranger"
                        @click="startSongFieldEdit(song.id, 'arranger', $event)"
                      >
                        ✎
                      </button>
                    </span>
                  </template>
                </div>
                <div class="edit-fact">
                  <span class="edit-lbl">Key</span>
                  <template
                    v-if="!isLibrarySourceLocked(song) && isSongFieldEditing(song.id, 'key')"
                  >
                    <select
                      :data-song-edit="`${song.id}-key`"
                      class="edit-input edit-input-select"
                      :value="song.key ?? ''"
                      aria-label="Key"
                      @change="onSongKey(song, $event)"
                      @blur="stopSongFieldEdit"
                      @keydown.escape.prevent="stopSongFieldEdit"
                    >
                      <option
                        v-for="k in keyOptionsFor(song.key)"
                        :key="k || 'none'"
                        :value="k"
                      >
                        {{ localLibraryKeyLabel(k) }}
                      </option>
                    </select>
                  </template>
                  <template v-else>
                    <span class="edit-body">
                      <span class="edit-val">{{ songKeyLabel(song) || '—' }}</span>
                      <button
                        v-if="!isLibrarySourceLocked(song)"
                        type="button"
                        class="edit-icon"
                        aria-label="Edit key"
                        title="Edit key"
                        @click="startSongFieldEdit(song.id, 'key', $event)"
                      >
                        ✎
                      </button>
                    </span>
                  </template>
                </div>
                <div class="edit-fact">
                  <span class="edit-lbl">Voicing</span>
                  <template v-if="isSongFieldEditing(song.id, 'voicing')">
                    <select
                      :data-song-edit="`${song.id}-voicing`"
                      class="edit-input edit-input-select"
                      :value="song.voicing ?? ''"
                      aria-label="Voicing"
                      @change="onSongVoicing(song, $event)"
                      @blur="stopSongFieldEdit"
                      @keydown.escape.prevent="stopSongFieldEdit"
                    >
                      <option value="">Unspecified</option>
                      <option v-for="v in VOICINGS" :key="v" :value="v">{{ v }}</option>
                    </select>
                  </template>
                  <template v-else>
                    <span class="edit-body">
                      <span class="edit-val">{{ song.voicing || '—' }}</span>
                      <button
                        type="button"
                        class="edit-icon"
                        aria-label="Edit voicing"
                        title="Edit voicing"
                        @click="startSongFieldEdit(song.id, 'voicing', $event)"
                      >
                        ✎
                      </button>
                    </span>
                  </template>
                </div>
              </div>

            <div class="song-link-block">
              <div class="edit-fact song-source-fact">
                <span class="edit-lbl">Source</span>
                <div
                  class="ctrl-segment ctrl-segment--compact song-source-seg"
                  role="group"
                  aria-label="Song source"
                >
                  <button
                    type="button"
                    :aria-pressed="!!song.isTag"
                    title="SingTags catalog tag"
                    @click="setSongIsTag(song, true)"
                  >
                    Tag
                  </button>
                  <button
                    type="button"
                    :aria-pressed="!song.isTag"
                    title="My Library / non-catalog song"
                    @click="setSongIsTag(song, false)"
                  >
                    Library
                  </button>
                </div>
              </div>
              <div
                v-for="target in [songOpenTarget(song)]"
                :key="`${song.id}-link`"
                class="edit-fact song-link-fact"
              >
                <span class="edit-lbl">Link</span>
                <span class="edit-body">
                  <template v-if="target">
                    <button
                      type="button"
                      class="edit-val song-link-open"
                      :title="songOpenLabel(song)"
                      @click="openSongPage(song)"
                    >
                      {{ target.label }}
                      <span v-if="!target.linked" class="song-link-match">match</span>
                    </button>
                  </template>
                  <span v-else class="edit-val song-link-none">None</span>
                  <button
                    type="button"
                    class="edit-icon"
                    :aria-expanded="linkPickerSongId === song.id"
                    :aria-label="target ? 'Change link' : songLinkActionLabel(song)"
                    :title="
                      !target && !song.isTag && !libraryEnabled
                        ? 'Enable My Library in Labs to link a library song'
                        : target
                          ? 'Change link'
                          : songLinkActionLabel(song)
                    "
                    :disabled="!target && !song.isTag && !libraryEnabled"
                    @click="openSongLinkPickerForSong(song)"
                  >
                    ✎
                  </button>
                </span>
              </div>
              <div
                v-if="linkPickerSongId === song.id && linkPickerKind === 'tag'"
                class="song-link-picker"
              >
                <input
                  v-model="tagQuery"
                  type="search"
                  placeholder="Search tags…"
                  aria-label="Search tags"
                />
                <ul v-if="tagHits.length" aria-label="Tag matches">
                  <li v-for="hit in tagHits" :key="hit.id">
                    <button type="button" @click="linkSongTag(song, hit)">
                      <span class="pick-title">{{ hit.title || `Tag ${hit.id}` }}</span>
                      <span class="pick-meta">#{{ hit.id }}</span>
                    </button>
                  </li>
                </ul>
                <p v-else-if="tagQuery.trim()" class="hint muted">No matches</p>
                <button
                  v-if="typeof song.tagId === 'number' && song.tagId > 0"
                  type="button"
                  class="link-clear"
                  @click="clearSongLink(song)"
                >
                  Unlink
                </button>
              </div>
              <div
                v-if="linkPickerSongId === song.id && linkPickerKind === 'library'"
                class="song-link-picker"
              >
                <input
                  v-model="libraryQuery"
                  type="search"
                  placeholder="Search My Library…"
                  aria-label="Search My Library"
                />
                <ul v-if="libraryHits.length" aria-label="Library matches">
                  <li v-for="hit in libraryHits" :key="hit.id">
                    <button type="button" @click="linkSongLibrary(song, hit)">
                      <span class="pick-title">{{ hit.title || 'Untitled' }}</span>
                      <span v-if="hit.arranger" class="pick-meta">{{ hit.arranger }}</span>
                    </button>
                  </li>
                </ul>
                <p v-else-if="libraryQuery.trim()" class="hint muted">No matches</p>
                <p v-else-if="!localLib.entries.length" class="hint muted">My Library is empty</p>
                <button
                  v-if="!!song.localEntryId"
                  type="button"
                  class="link-clear"
                  @click="clearSongLink(song)"
                >
                  Unlink
                </button>
              </div>
            </div>

            <div class="parts-row" role="group" aria-label="Parts you know">
              <div class="parts-chips">
                <PartConfidenceRate
                  v-for="pid in partsForVoicing(song.voicing)"
                  :key="pid"
                  :label="partLabel(pid)"
                  :model-value="songPartConfidence(song, pid)"
                  @update:model-value="setSongPartConfidence(song, pid, $event)"
                />
              </div>
              <div class="parts-bulk" role="group" aria-label="Set for all parts">
                <button
                  type="button"
                  class="btn"
                  title="All parts, 5 stars — memorized / off book"
                  @click="applyAllParts(song, 'off-book')"
                >
                  Off book
                </button>
                <button
                  type="button"
                  class="btn"
                  title="All parts, 3 stars — with music / on book"
                  @click="applyAllParts(song, 'on-book')"
                >
                  On book
                </button>
                <button
                  type="button"
                  class="btn btn-ghost"
                  title="Clear all parts"
                  @click="applyAllParts(song, 'clear')"
                >
                  Clear
                </button>
              </div>
            </div>
            </div>
          </li>
        </ul>
        <p v-else-if="repertoireSearch.trim()" class="hint">No songs match that search.</p>
        <p v-else-if="listFilter === 'needs-details' && store.profile.songs.length" class="hint">
          Every song has parts marked — switch to All to see your repertoire.
        </p>
        <p v-else-if="store.profile.songs.length" class="hint">No songs in this collection.</p>
        <p v-else class="hint empty-start">
          <button type="button" class="linkish" @click="openQuickAdd">Add to Repertoire</button>,
          or
          <button type="button" class="linkish" @click="openPasteSongs">import from clipboard</button>.
        </p>
      </div>
    </div>

    <!-- My QR -->
    <div v-show="mode === 'qr'" role="tabpanel" aria-label="My QR">
      <section class="card">
        <label class="field">
          <span class="field-label">Display name (shown when scanned)</span>
          <input
            ref="displayNameEl"
            :value="store.profile.displayName"
            type="text"
            maxlength="64"
            autocomplete="nickname"
            placeholder="Your name (shown when scanned)"
            @input="store.setDisplayName(($event.target as HTMLInputElement).value)"
          />
        </label>

        <div class="qr-stage">
          <p v-if="qrBusy" class="hint">Building QR…</p>
          <p v-else-if="qrError" class="cap-hint">{{ qrError }}</p>
          <button
            v-else-if="qrSrc"
            type="button"
            class="qr-btn"
            aria-label="Enlarge QR code"
            @click="enlargeOpen = true"
          >
            <img :src="qrSrc" alt="Your Sing Together repertoire QR" width="240" height="240" />
          </button>
          <p v-else class="hint">Add songs to generate a QR.</p>
        </div>

        <div
          class="cap-meter"
          role="status"
          :class="{ warn: cap.warn, critical: cap.critical }"
          :aria-label="`QR capacity used ${Math.min(100, Math.round((cap.usedBytes / absMax) * 100))} percent`"
        >
          <p class="cap-text">
            QR capacity used:
            {{ Math.min(100, Math.round((cap.usedBytes / absMax) * 100)) }}%
          </p>
          <p v-if="cap.warn && !cap.critical" class="cap-hint">
            Getting full — consider trimming songs.
          </p>
          <p v-if="cap.critical" class="cap-hint">
            Full — remove songs or shorten titles/arrangers.
          </p>
        </div>
      </section>
    </div>

    <!-- Scan for matches -->
    <div v-show="mode === 'host'" role="tabpanel" aria-label="Scan for matches">
      <div class="host-toolbar">
        <div class="host-title-row">
          <h2 class="host-h">Singers</h2>
          <InfoTips label="How singer matching works" title="How singer matching works">
            <p>
              You are always included. Scan any number of My QR codes — we match every combination of
              two or more singers (titles and AKA both count). Incomplete parts stay in the list so
              others can sight-read.
            </p>
            <p>Tap × on a singer to remove them; matches update immediately.</p>
          </InfoTips>
        </div>
        <div class="host-actions">
          <button type="button" class="btn" @click="openHostScan">Scan QR Codes</button>
          <button
            type="button"
            class="btn toggle"
            :class="{ on: matchOptionsOpen }"
            :aria-pressed="matchOptionsOpen"
            :aria-expanded="matchOptionsOpen"
            :aria-controls="matchOptionsOpen ? 'match-options-panel' : undefined"
            @click="toggleMatchOptions"
          >
            Match options
          </button>
        </div>
      </div>
      <div
        v-if="matchOptionsOpen"
        id="match-options-panel"
        class="quick-add-panel match-options-panel"
        role="region"
        aria-label="Match options"
        @keydown.escape.prevent="closeMatchOptions"
      >
        <div class="match-options-body">
          <p class="hint match-options-hint">
            Primary title and alternate titles (AKA) always match. Optional fields are off by
            default — turn them on for stricter matching. Blank arranger, voicing, or parts act as
            wildcards when those criteria are on.
          </p>
          <div class="ctrl-field">
            <span class="ctrl-field-label">Match criteria</span>
            <div class="criteria-toggles" role="group" aria-label="Match criteria">
              <button type="button" class="ctrl-toggle" aria-pressed="true" disabled>
                Title / AKA
              </button>
              <button
                type="button"
                class="ctrl-toggle"
                :aria-pressed="matchCriteria.arranger"
                @click="matchCriteria.arranger = !matchCriteria.arranger"
              >
                Arranger
              </button>
              <button
                type="button"
                class="ctrl-toggle"
                :aria-pressed="matchCriteria.voicing"
                @click="matchCriteria.voicing = !matchCriteria.voicing"
              >
                Voice range
              </button>
              <button
                type="button"
                class="ctrl-toggle"
                :aria-pressed="matchCriteria.parts"
                @click="matchCriteria.parts = !matchCriteria.parts"
              >
                Parts
              </button>
            </div>
            <p class="hint crit-note">Parts = share ≥1 known part when both list parts.</p>
          </div>
          <div class="ctrl-field">
            <span class="ctrl-field-label">Text matching</span>
            <select
              v-model="textMode"
              class="ctrl-select"
              aria-label="Text matching"
              @change="($event.target as HTMLSelectElement).blur()"
            >
              <option value="exact">Exact (normalized case/spacing)</option>
              <option value="partial">Partial (contains / token subset)</option>
              <option value="fuzzy">Fuzzy (typos, “The …”, light edits)</option>
            </select>
          </div>
        </div>
      </div>
      <p v-if="!store.songCount" class="host-empty-warn" role="status">
        Add your songs on Repertoire first — matches are based on your list.
        <button type="button" class="linkish" @click="setMode('repertoire')">Go to Repertoire</button>
      </p>
      <div class="roster" aria-label="Singers in this match">
        <span class="roster-chip on"
          >You{{ store.profile.displayName ? `: ${store.profile.displayName}` : '' }}</span
        >
        <button
          v-for="p in hostPeople"
          :key="p.id"
          type="button"
          class="roster-chip"
          :title="`Remove ${p.profile.displayName}`"
          :aria-label="`Remove ${p.profile.displayName}`"
          @click="removePerson(p.id)"
        >
          {{ p.profile.displayName }}
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <section class="card" aria-labelledby="results-h">
        <div class="results-meta">
          <div class="results-titles">
            <h2 id="results-h">Matches ({{ matched.length }})</h2>
            <p v-if="matchedAll.length" class="results-sub text-muted count">
              <span>{{ coverableCount }} fully covered</span>
              <span v-if="filteredOutCount">{{ filteredOutCount }} hidden by filter</span>
            </p>
          </div>
          <div v-if="matchedAll.length" class="sort-controls">
            <label class="sort-field" title="Order shared songs">
              <span class="sort-lbl">Sort</span>
              <select
                v-model="sortMode"
                aria-label="Sort matches"
                @change="($event.target as HTMLSelectElement).blur()"
              >
                <option value="parts-people">Parts covered, then people</option>
                <option value="people-parts">People who know, then parts</option>
                <option value="parts-title">Parts covered, then title</option>
                <option value="people-title">People who know, then title</option>
                <option value="title">Title</option>
              </select>
            </label>
            <label class="sort-field" title="Hide songs below this part coverage">
              <span class="sort-lbl">Min parts</span>
              <select
                v-model.number="minPartsFilter"
                aria-label="Minimum parts covered"
                @change="($event.target as HTMLSelectElement).blur()"
              >
                <option :value="0">Show all</option>
                <option :value="1">1+ parts</option>
                <option :value="2">2+ parts</option>
                <option :value="3">3+ parts</option>
                <option :value="4">All parts</option>
              </select>
            </label>
          </div>
        </div>

        <ul v-if="matched.length" class="match-list">
          <li
            v-for="song in matched"
            :key="song.matchKey"
            class="match-item"
            :class="{ coverable: song.coverable }"
          >
            <div class="match-title-row">
              <span class="match-title">{{ song.title }}</span>
              <span class="badge" :class="{ muted: !song.coverable }">{{
                matchCoverageLabel(song)
              }}</span>
            </div>
            <div v-if="song.altTitles?.length" class="match-aka alt-title">
              {{ song.altTitles.join(', ') }}
            </div>
            <div class="match-singers" aria-label="Singers who know this song">
              <span
                v-for="s in song.singers"
                :key="s.id"
                class="singer-pill"
              >{{ s.displayName }}</span>
            </div>
            <div v-if="matchSongMetaItems(song).length" class="match-meta meta">
              <span v-for="(bit, i) in matchSongMetaItems(song)" :key="`${song.matchKey}-meta-${i}`">{{
                bit
              }}</span>
            </div>
            <div class="match-coverage" aria-label="Part coverage">
              <div
                v-for="part in coverageParts(song)"
                :key="part.id"
                class="cov-part"
                :class="{ covered: part.count > 0 }"
              >
                <span class="cov-part-label">{{ part.label }}</span>
                <span class="cov-part-count">{{ part.count }}</span>
                <span v-if="part.names" class="cov-part-names">{{ part.names }}</span>
                <span v-else class="cov-part-names muted">sight-read?</span>
              </div>
            </div>
          </li>
        </ul>
        <p v-else class="hint">
          {{
            !store.songCount && !hostPeople.length
              ? 'Add songs on Repertoire, then scan singers to find matches.'
              : matchedAll.length && filteredOutCount
                ? 'No matches at this min-parts setting — choose “Show all” to see incomplete coverage.'
                : hostPeople.length
                  ? 'No titles in common yet — try alternate titles / spelling, or open Match options.'
                  : 'Scan at least one other singer to find shared songs.'
          }}
        </p>
      </section>

      <SingTogetherHostScanner
        :open="hostScanning"
        :flash-message="scanFlash"
        @close="closeHostScan"
        @detected="ingestScan"
        @error="onHostScanError"
      />
    </div>

    <SingTogetherCsvImportModal
      :open="csvImportOpen"
      @close="csvImportOpen = false"
      @pick="onCsvImport"
    />
    <SingTogetherPasteTitlesModal
      :open="pasteTitlesOpen"
      @close="pasteTitlesOpen = false"
      @pick="onPasteSongs"
    />
    <SingTogetherLibraryImportModal
      :open="libraryImportOpen"
      :entries="localLib.entries"
      :linked-entry-ids="linkedLibraryEntryIds"
      @close="libraryImportOpen = false"
      @pick="onLibraryImport"
    />

    <Teleport to="body">
      <div
        v-if="selectedIds.size > 0 && mode === 'repertoire'"
        class="selection-bar"
        role="toolbar"
        aria-label="Repertoire selection"
      >
        <span class="sel-count">{{ selectedIds.size }} selected</span>
        <button
          type="button"
          class="btn"
          aria-label="Add to collection"
          title="Add selected songs to a collection"
          @click="openCollectionPicker"
        >
          <span class="label-long">Add to Collection</span>
          <span class="label-short">+Collection</span>
        </button>
        <button
          v-if="activeCollectionId"
          type="button"
          class="btn"
          :aria-label="`Remove selected from ${store.collectionById(activeCollectionId)?.name ?? 'collection'}`"
          title="Remove selected songs from this collection only — keeps them in your repertoire"
          @click="removeSelectedFromCollection"
        >
          <span class="label-long">Remove from collection</span>
          <span class="label-short">−Collection</span>
        </button>
        <button
          type="button"
          class="btn btn-remove-icon"
          aria-label="Delete selected"
          title="Delete selected from repertoire"
          @click="requestRemoveSelected"
        >
          ×
        </button>
        <button type="button" class="btn btn-ghost" title="Clear selection" @click="clearSelection">
          Clear
        </button>
      </div>
    </Teleport>

    <SingTogetherCollectionPickerSheet
      :open="collectionPickerOpen"
      :song-ids="[...selectedIds]"
      title="Add to collection"
      @close="collectionPickerOpen = false"
      @done="onCollectionPickerDone"
    />

    <SingTogetherCollectionsManageSheet
      :open="manageCollectionsOpen"
      @close="manageCollectionsOpen = false"
      @created="onManageCollectionCreated"
      @deleted="onManageCollectionDeleted"
    />

    <ConfirmDialog
      :open="!!pendingDeleteIds?.length"
      title="Are you sure?"
      :message="pendingDeleteMessage"
      confirm-label="Delete"
      @close="cancelRemoveSong"
      @confirm="confirmRemoveSong"
    />

    <Teleport to="body">
      <div
        v-if="enlargeOpen && qrSrc"
        class="qr-enlarge"
        role="dialog"
        aria-modal="true"
        aria-label="Enlarged repertoire QR"
        @click.self="enlargeOpen = false"
      >
        <button type="button" class="btn btn-ghost enlarge-close" @click="enlargeOpen = false">
          Close
        </button>
        <img :src="qrSrc" alt="Enlarged Sing Together QR" class="enlarge-img" />
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.st {
  display: grid;
  gap: 1rem;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding: 0.15rem 0 2rem;
}
.st.has-selection {
  padding-bottom: 5.5rem;
}
.st-head {
  display: grid;
  gap: 0.35rem;
}
.st-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.45rem;
  font-weight: 700;
}
.st-intro,
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
}
.empty-start {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.5rem;
}
.linkish {
  border: 0;
  padding: 0;
  background: none;
  color: var(--accent);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 0.12em;
}
.linkish:hover {
  color: var(--accent-hover, var(--accent));
}
.qr-nudge {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.65rem;
  margin: 0 0 0.65rem;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 12%, var(--bg));
  color: var(--text);
  font-size: 0.9rem;
  line-height: 1.35;
}
.nudge-dismiss {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  cursor: pointer;
  min-height: 32px;
  min-width: 32px;
}
.quick-add-panel {
  display: grid;
  gap: 0.65rem;
  margin: 0 0 0.75rem;
  padding: 0.85rem 1rem;
  border-radius: var(--radius, 8px);
  border: 1px solid var(--border);
  background: var(--surface);
}
.btn.toggle.on {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  border-color: var(--accent);
  color: var(--accent-hover, var(--accent));
  font-weight: 700;
}
.quick-add {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.quick-chips {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.35rem;
  width: 100%;
  max-width: 100%;
}
@media (max-width: 720px) {
  .quick-chips {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
@media (max-width: 480px) {
  .quick-chips {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
.quick-chip {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.05rem;
  min-width: 0;
  min-height: 2.5rem;
  padding: 0.25rem 0.4rem;
  border-radius: 8px;
  border: 1px dashed color-mix(in srgb, var(--border) 85%, var(--muted));
  background: color-mix(in srgb, var(--border) 22%, var(--bg));
  color: var(--muted);
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.quick-chip.ghost {
  opacity: 0.72;
}
.quick-chip.filled {
  opacity: 1;
  border-style: solid;
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--bg));
  color: var(--text);
}
.quick-chip.active {
  opacity: 1;
  border-style: solid;
  border-color: var(--accent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
  color: var(--text);
}
.quick-chip:disabled {
  cursor: default;
  opacity: 0.4;
}
.quick-chip-k {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}
.quick-chip-v {
  font-size: 0.82rem;
  font-weight: 600;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.quick-add-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: flex-end;
  gap: 0.35rem;
  min-width: 0;
  width: 100%;
  min-height: 4.75rem;
}
.quick-field {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
  flex: 1 1 auto;
}
.quick-field-active {
  min-width: 0;
}
.quick-field input,
.quick-field select {
  font: inherit;
  padding: 0.45rem 0.55rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  width: 100%;
  min-height: 44px;
  box-sizing: border-box;
}
.quick-link-field {
  position: relative;
  z-index: 2;
}
.quick-link-box {
  position: relative;
  display: grid;
  gap: 0.25rem;
}
.quick-link-box > input {
  padding-right: 2.25rem;
}
.quick-link-clear {
  position: absolute;
  top: 0.35rem;
  right: 0.3rem;
  width: 2rem;
  height: 2rem;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}
.quick-link-dropdown {
  list-style: none;
  margin: 0;
  padding: 0.25rem;
  display: grid;
  gap: 0.2rem;
  max-height: 12rem;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  box-shadow: 0 6px 18px color-mix(in srgb, var(--fg, #000) 12%, transparent);
}
.quick-link-dropdown button {
  width: 100%;
  text-align: left;
  min-height: 2.4rem;
  margin: 0;
  padding: 0.4rem 0.55rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font: inherit;
  color: inherit;
  cursor: pointer;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: baseline;
}
.quick-link-dropdown button.active,
.quick-link-dropdown button:hover {
  background: color-mix(in srgb, var(--accent) 14%, var(--bg));
}
.quick-link-dropdown .muted,
.quick-link-empty {
  color: var(--muted);
  font-size: 0.85em;
}
.quick-link-empty {
  margin: 0;
}
.quick-title-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  min-height: 44px;
  padding: 0.3rem 0.4rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg);
  cursor: text;
  box-sizing: border-box;
}
.quick-title-box:focus-within {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent);
}
.title-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  max-width: 100%;
  min-height: 1.85rem;
  padding: 0.15rem 0.2rem 0.15rem 0.5rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--text);
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1.2;
}
.title-pill.primary {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
}
.title-pill-text {
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.title-pill-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}
.title-pill-x:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--border) 45%, transparent);
}
.quick-title-draft {
  flex: 1 1 6rem;
  min-width: 5rem;
  min-height: 2rem !important;
  margin: 0;
  padding: 0.25rem 0.15rem !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  width: auto !important;
}
.quick-know {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem 0.65rem;
}
.quick-know .field-label {
  flex: 0 0 auto;
}
.sel-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  width: 44px;
  padding: 0.35rem 0.55rem;
  margin: 0;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1;
  color: var(--accent);
  cursor: pointer;
  touch-action: manipulation;
}
.sel-btn.on {
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  border-color: var(--accent);
}
.quick-know-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
  outline-offset: 2px;
}
.quick-rate-wrap {
  min-width: 0;
}
.quick-rate {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.1rem 0.25rem;
  min-height: 44px;
  outline: none;
}
.quick-rate:focus-visible {
  border-radius: 8px;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent);
}
.quick-star {
  margin: 0;
  padding: 0.15rem 0.2rem;
  min-width: 2rem;
  min-height: 2.5rem;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: color-mix(in srgb, var(--muted) 45%, var(--border));
  font: inherit;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
  touch-action: manipulation;
}
.quick-star.on {
  color: var(--accent);
}
.quick-star:hover:not(:disabled),
.quick-star:focus-visible {
  color: var(--accent-hover, var(--accent));
  outline: none;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.quick-star-clear {
  margin: 0 0 0 0.25rem;
  padding: 0.25rem 0.45rem;
  min-height: 2rem;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
.quick-nav {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.2rem;
  padding-bottom: 0;
}
.quick-nav-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin: 0;
  padding: 0;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}
.quick-nav-icon:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.quick-nav-done {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 14%, var(--bg));
  color: var(--accent);
}
.quick-nav-done:disabled {
  opacity: 0.4;
}
.quick-hint {
  margin: 0;
  font-size: 0.82rem;
}
.quick-hint code {
  font-size: 0.9em;
}
.host-empty-warn {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.5rem;
  margin: 0 0 0.5rem;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--bg));
  color: var(--text);
  font-size: 0.9rem;
  line-height: 1.35;
}
.cap-meter {
  display: grid;
  gap: 0.25rem;
  margin: 0.15rem 0 0;
}
.cap-meter.warn .cap-text,
.cap-meter.critical .cap-text {
  font-weight: 600;
}
.cap-meter.warn .cap-text {
  color: var(--warn, #a60);
}
.cap-meter.critical .cap-text {
  color: var(--danger, #b33);
}
.match-options-hint {
  margin: 0;
}
.match-options-body {
  display: grid;
  gap: 0.65rem;
}
.match-options-panel .ctrl-field {
  display: grid;
  gap: 0.35rem;
  min-width: 0;
}
.criteria-toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.crit-note {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
}
.ctrl-select {
  font: inherit;
  font-size: 0.9rem;
  min-height: 40px;
  padding: 0.35rem 0.55rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  max-width: 100%;
  width: 100%;
}
.st-tabs {
  /* Keep shared .ctrl-tabs chrome; only widen for three modes when space allows. */
  width: 100%;
}
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius, 8px);
  padding: 0.85rem 1rem;
  display: grid;
  gap: 0.65rem;
}
.card h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 600;
}
.repertoire-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.65rem;
  margin-bottom: 0.65rem;
}
.import-menu-wrap {
  position: relative;
}
.import-menu {
  position: absolute;
  top: calc(100% + 0.35rem);
  right: 0;
  left: auto;
  z-index: 12;
  min-width: 11.5rem;
  display: grid;
  gap: 0.2rem;
  padding: 0.35rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 10px 28px color-mix(in srgb, var(--text) 14%, transparent);
}
.import-menu-item {
  display: block;
  width: 100%;
  min-height: 44px;
  padding: 0.45rem 0.65rem;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.import-menu-item:hover {
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  color: var(--accent-hover, var(--accent));
}
.btn {
  min-height: 44px;
  padding: 0.45rem 0.85rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-weight: 650;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn-ghost {
  background: transparent;
}
.btn-ghost.on {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  border-color: var(--accent);
  color: var(--accent-hover, var(--accent));
}
.btn.danger,
.danger {
  color: var(--danger, #b42318);
}
.field {
  display: grid;
  gap: 0.25rem;
}
.field-label {
  font-size: 0.85rem;
  color: var(--muted);
}
.field input,
.field select {
  font: inherit;
  min-height: 40px;
  padding: 0.45rem 0.55rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}
.parts-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.55rem;
  padding-top: 0.15rem;
}
.parts-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.35rem;
  min-width: 0;
}
.parts-bulk {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin-left: auto;
}
.parts-bulk .btn {
  min-height: 40px;
  padding: 0.35rem 0.7rem;
  font-size: 0.85rem;
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.2rem;
}
.songs-block {
  display: grid;
  gap: 0.55rem;
}
.collection-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.45rem;
  margin-bottom: 0.15rem;
}
.collection-strip {
  flex: 1 1 12rem;
  min-width: 0;
  display: grid;
  grid-template-columns: 1fr;
  align-items: start;
  gap: 0.35rem;
}
.collection-strip.paged {
  grid-template-columns: auto 1fr auto;
}
.collection-strip-body {
  position: relative;
  min-width: 0;
}
.collection-measure {
  position: absolute;
  visibility: hidden;
  pointer-events: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  top: 0;
  left: 0;
}
.collection-page {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.collection-strip-nav {
  min-width: 40px;
  min-height: 40px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}
.collection-strip-nav:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 36px;
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  color: inherit;
}
.chip.on {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--accent);
}
.chip-n {
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
  color: var(--muted);
}
.chip.on .chip-n {
  color: inherit;
  opacity: 0.85;
}
.drag-handle {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  min-height: 40px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 1.05rem;
  line-height: 1;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.drag-handle:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.drag-handle:active {
  cursor: grabbing;
}
.list.list-dragging {
  user-select: none;
}
.list-row.dragging {
  opacity: 0.55;
}
.list-row.drop-before {
  box-shadow: inset 0 2px 0 var(--accent);
}
.list-row.drop-after {
  box-shadow: inset 0 -2px 0 var(--accent);
}
.text-muted {
  color: var(--muted);
  font-weight: 500;
}
.list-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.45rem 0.75rem;
}
.list-head .count {
  margin: 0;
  flex: 1 1 8rem;
  min-width: 0;
  font-size: 0.88rem;
  line-height: 1.35;
}
.list-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem 0.65rem;
}
.list-filter {
  flex-shrink: 0;
}
.list-sort {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}
.sort-rev {
  min-width: 40px;
  min-height: 40px;
  padding: 0.35rem 0.5rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-size: 1rem;
  line-height: 1;
  color: var(--muted);
  font-weight: 700;
  cursor: pointer;
}
.sort-rev.on {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  border-color: var(--accent);
  color: var(--accent-hover, var(--accent));
}
.search-toolbar {
  margin-bottom: 0.35rem;
}
.search-field {
  position: relative;
  display: flex;
  align-items: stretch;
  min-width: 0;
}
.search-field input[type='search'] {
  flex: 1;
  min-width: 0;
  width: 100%;
  min-height: 44px;
  padding: 0.55rem 2.5rem 0.55rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius, 8px);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 16px;
}
.search-field input[type='search']::-webkit-search-cancel-button {
  -webkit-appearance: none;
  appearance: none;
  display: none;
}
.search-infield {
  position: absolute;
  right: 0.3rem;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
}
.icon-btn.clear-infield {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  min-height: 36px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}
.icon-btn.clear-infield:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--border) 35%, transparent);
}
.list-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 0.25rem;
  align-items: center;
  padding: 0.2rem 0.25rem;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid transparent;
}
.list-row.show-select {
  grid-template-columns: auto 1fr auto auto;
}
.list-row:has(.drag-handle) {
  grid-template-columns: auto 1fr auto auto;
}
.list-row.show-select:has(.drag-handle) {
  grid-template-columns: auto auto 1fr auto auto;
}
.list-row:has(.row-open) {
  grid-template-columns: 1fr auto auto auto;
}
.list-row.show-select:has(.row-open) {
  grid-template-columns: auto 1fr auto auto auto;
}
.list-row:has(.drag-handle):has(.row-open) {
  grid-template-columns: auto 1fr auto auto auto;
}
.list-row.show-select:has(.drag-handle):has(.row-open) {
  grid-template-columns: auto auto 1fr auto auto auto;
}
.list-row.expanded {
  border-color: var(--border);
}
.list-row:focus-within {
  border-color: var(--border);
}
.row-link {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.3rem 0.25rem;
  color: inherit;
  text-decoration: none;
  min-height: 44px;
  justify-content: center;
  min-width: 0;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.row-link:hover {
  color: var(--accent-hover);
}
.list-row.expanded .song-edit {
  grid-column: 1 / -1;
}
.row-flow {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 0.65rem;
  row-gap: 0.12rem;
  min-width: 0;
}
.title-text {
  font-weight: 650;
  min-width: 0;
}
.flow-bit {
  color: var(--muted);
  font-size: 0.86rem;
  font-weight: 500;
  white-space: nowrap;
}
.flow-bit.aka {
  font-style: italic;
  font-weight: 500;
}
.flow-parts {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 0.55rem;
  row-gap: 0.12rem;
}
.row-badge {
  display: inline-block;
  padding: 0.02rem 0.35rem;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--accent);
  font-weight: 600;
  font-size: 0.72em;
  letter-spacing: 0.02em;
  vertical-align: 0.05em;
}
.row-badge.muted {
  color: var(--muted);
  border-color: var(--border);
  background: color-mix(in srgb, var(--border) 35%, var(--surface));
}
.edit-pitch {
  width: 100%;
  min-width: 0;
}
.row-open {
  flex-shrink: 0;
  min-height: 40px;
  min-width: 40px;
  padding: 0.25rem 0.55rem;
  align-self: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: inherit;
  font: inherit;
  font-size: 0.88rem;
  font-weight: 650;
  cursor: pointer;
}
.row-open:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  color: var(--accent);
}
.row-remove {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  min-height: 40px;
  align-self: center;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
}
.row-remove:hover {
  color: var(--danger, #b42318);
}
.song-edit {
  display: grid;
  gap: 0.4rem;
  padding: 0.15rem 0.7rem 0.75rem;
  border-top: 1px solid var(--border);
}
.edit-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.35rem 0.85rem;
}
.edit-fact {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.25rem 0.4rem;
  align-items: center;
  min-height: 1.65rem;
  min-width: 0;
}
.edit-fact-title {
  grid-template-columns: 3.25rem minmax(0, 1fr);
  width: 100%;
}
.edit-meta .edit-fact {
  flex: 0 1 auto;
  max-width: 100%;
}
.edit-lbl {
  font-size: 0.72rem;
  font-weight: 650;
  color: var(--muted);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.edit-body {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  min-width: 0;
}
.edit-val {
  min-width: 0;
  font-size: 0.9rem;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.edit-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  min-height: 32px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
}
.edit-icon:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.edit-input {
  box-sizing: border-box;
  width: auto;
  max-width: min(18rem, 100%);
  min-width: 7.5rem;
  min-height: 40px;
  padding: 0.3rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 16px;
}
.edit-input-title {
  min-width: 10rem;
  max-width: min(22rem, 100%);
}
.edit-input-select {
  min-width: 6.5rem;
  max-width: max-content;
  width: max-content;
}
.song-link-block {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.35rem 0.85rem;
}
.song-source-fact {
  flex: 0 1 auto;
}
.song-source-seg {
  flex: 0 0 auto;
}
.song-source-seg > button {
  min-height: 40px;
  padding: 0.35rem 0.7rem;
  font-size: 0.85rem;
}
.song-link-fact {
  flex: 1 1 12rem;
  min-width: 0;
  grid-template-columns: 3.25rem minmax(0, 1fr);
}
.song-link-open {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 650;
  line-height: 1.3;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.song-link-open:hover {
  color: var(--accent-hover, var(--accent));
}
.song-link-none {
  color: var(--muted);
}
.song-link-match {
  flex-shrink: 0;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
  text-decoration: none;
}
.link-clear {
  justify-self: start;
  margin: 0;
  padding: 0.25rem 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
.link-clear:hover {
  color: var(--danger, #b42318);
}
.song-link-picker {
  flex: 1 1 100%;
  display: grid;
  gap: 0.35rem;
  padding: 0.45rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--border) 18%, var(--surface));
}
.song-link-picker input {
  box-sizing: border-box;
  width: 100%;
  min-height: 40px;
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 16px;
}
.song-link-picker ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.2rem;
  max-height: 10rem;
  overflow: auto;
}
.song-link-picker li button {
  width: 100%;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 36px;
  padding: 0.3rem 0.5rem;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.88rem;
  text-align: left;
  cursor: pointer;
}
.song-link-picker li button:hover {
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.song-link-picker .pick-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 650;
}
.song-link-picker .pick-meta {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 0.78rem;
}
.cap-text {
  margin: 0;
  font-size: 0.85rem;
}
.cap-hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--warn, #a60);
}
.qr-stage {
  display: grid;
  place-items: center;
  min-height: 12rem;
}
.qr-btn {
  padding: 0;
  border: none;
  background: #fff;
  border-radius: 8px;
  cursor: zoom-in;
}
.qr-btn img {
  display: block;
  width: min(240px, 70vw);
  height: auto;
}
.host-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  margin-bottom: 0.5rem;
}
.host-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}
.host-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.5rem;
  min-width: 0;
}
.host-h {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 600;
}
.roster {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
}
.roster-chip {
  font: inherit;
  font-size: 0.85rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.25rem 0.65rem;
  background: var(--surface);
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.roster-chip.on {
  cursor: default;
  background: color-mix(in srgb, var(--accent, #0a7) 18%, transparent);
}
.results-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.45rem 0.75rem;
}
.results-titles {
  display: grid;
  gap: 0.15rem;
  flex: 1 1 10rem;
  min-width: 0;
}
.results-titles h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 600;
}
.results-sub {
  margin: 0;
  font-weight: 500;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.35;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.sort-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.65rem;
  flex-shrink: 0;
}
.sort-field {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: 0 0 auto;
  margin: 0;
}
.sort-lbl {
  font-size: 0.85rem;
  color: var(--muted);
  font-weight: 600;
  white-space: nowrap;
}
.sort-field select {
  font: inherit;
  font-size: 0.9rem;
  min-height: 40px;
  padding: 0.35rem 0.55rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  max-width: 100%;
}
.match-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}
.match-item {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.65rem 0.75rem;
  display: grid;
  gap: 0.35rem;
  background: var(--bg);
}
.match-item.coverable {
  border-color: color-mix(in srgb, var(--accent, #0a7) 45%, var(--border));
  background: color-mix(in srgb, var(--accent, #0a7) 6%, var(--bg));
}
.match-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem 0.55rem;
}
.match-title {
  font-weight: 700;
  min-width: 0;
  overflow-wrap: anywhere;
}
.match-aka {
  color: var(--muted);
  font-weight: 500;
  font-size: 0.88em;
  font-style: italic;
  line-height: 1.35;
}
.match-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  color: var(--muted);
  font-size: 0.86rem;
}
.match-singers {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.singer-pill {
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.match-coverage {
  display: grid;
  gap: 0.3rem;
  margin-top: 0.15rem;
}
.cov-part {
  display: grid;
  grid-template-columns: minmax(4.5rem, auto) 1.5rem minmax(0, 1fr);
  gap: 0.35rem 0.5rem;
  align-items: baseline;
  font-size: 0.82rem;
  padding: 0.25rem 0.4rem;
  border-radius: 6px;
  background: color-mix(in srgb, var(--border) 35%, transparent);
}
.cov-part.covered {
  background: color-mix(in srgb, var(--accent, #0a7) 12%, transparent);
}
.cov-part-label {
  font-weight: 650;
}
.cov-part-count {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  text-align: center;
}
.cov-part.covered .cov-part-count {
  color: var(--accent-hover, var(--accent));
  font-weight: 700;
}
.cov-part-names {
  min-width: 0;
  overflow-wrap: anywhere;
}
.cov-part-names.muted {
  color: var(--muted);
}
.badge {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent, #0a7) 22%, transparent);
  max-width: 100%;
  overflow-wrap: anywhere;
}
.badge.muted {
  background: var(--border);
  color: var(--muted);
}
.qr-enlarge {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(0, 0, 0, 0.82);
  display: grid;
  place-items: center;
  padding: 1rem;
}
.enlarge-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  color: #fff;
}
.enlarge-img {
  width: min(92vw, 92vh);
  height: auto;
  background: #fff;
  border-radius: 8px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
</style>

<style>
/* Teleported selection bar (same chrome as Favorites / TagSelectionBar). */
.selection-bar {
  container-type: inline-size;
  container-name: selection-bar;
  position: fixed;
  left: 0;
  right: 0;
  z-index: 25;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  padding: 0.55rem 0.6rem;
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  border-top: 1px solid var(--border);
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(10px);
  bottom: calc(var(--bottom-nav-h, 3.75rem) + env(safe-area-inset-bottom));
}
.selection-bar .sel-count {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin-right: auto;
  font-size: 0.88rem;
}
.selection-bar .btn {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 0.88rem;
  padding: 0.45rem 0.55rem;
}
.selection-bar .label-short {
  display: none;
}
.selection-bar .label-long {
  display: inline;
}
.selection-bar .btn-remove-icon {
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  font-size: 1.5rem;
  line-height: 1;
  font-weight: 400;
  color: var(--muted);
}
.selection-bar .btn-remove-icon:hover {
  color: var(--danger);
}
@container selection-bar (max-width: 34rem) {
  .selection-bar .label-long {
    display: none;
  }
  .selection-bar .label-short {
    display: inline;
  }
}
@media (min-width: 640px) {
  .selection-bar {
    gap: 0.45rem;
    padding: 0.65rem 0.75rem;
  }
  .selection-bar .sel-count {
    font-size: 0.95rem;
  }
  .selection-bar .btn {
    font-size: 0.92rem;
    padding: 0.5rem 0.75rem;
  }
}
@media (min-width: 768px) {
  .selection-bar {
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    width: min(960px, calc(100% - 2rem));
    bottom: 1rem;
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: 0 10px 32px rgba(0, 0, 0, 0.12);
  }
}
</style>
