<script setup lang="ts">
/**
 * Set List detail — concert order, Edit/reorder, card meta, and set-list pitch overrides.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import EmptyState from '../components/EmptyState.vue'
import {
  PitchPlayer,
  clampPitchSemitones,
  formatKeyShiftLabel,
  keyToTonicNote,
  transposeKeyLabel,
} from '../audio/pitchPlayer'
import {
  getActivePitchPipeVoice,
  PITCH_PIPE_VOICE_CHANGE_EVENT,
} from '../audio/pitchPipeVoice'
import { useSortableListDrag } from '../composables/useSortableListDrag'
import { formatTrackDuration, probeAudioDurationSeconds } from '../lib/audioDuration'
import { pickMixTrackAsset } from '../lib/localMixTrack'
import { useLocalLibraryStore } from '../stores/localLibrary'
import { useLocalPlaylistsStore } from '../stores/localPlaylists'
import { usePreferencesStore } from '../stores/preferences'
import { useSnackbarStore } from '../stores/snackbar'
import { localLibraryKeyLabel } from '../types/localLibrary'

const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()
const library = useLocalLibraryStore()
const playlists = useLocalPlaylistsStore()
const prefs = usePreferencesStore()
const snackbar = useSnackbarStore()

const renameDraft = ref('')
const pickerOpen = ref(false)
const pickSelected = ref<Set<string>>(new Set())
const customizingPitch = ref(false)
const durationByEntryId = ref<Record<string, number | null>>({})
const durationBusy = new Set<string>()
const pitch = new PitchPlayer(getActivePitchPipeVoice())

const playlist = computed(() => playlists.byId(props.id))
const editing = computed(() => route.query.edit === '1' || route.query.edit === 'true')
const sungCount = computed(() => playlist.value?.sungItemIds.length ?? 0)
const cardLayout = computed(() =>
  playlist.value?.cardLayout === 'compact' ? 'compact' : 'comfortable',
)
/** Pitch column: on in performance when enabled; always on while customizing in Edit. */
const showPitchColumn = computed(() => {
  if (!playlist.value) return false
  if (editing.value && customizingPitch.value) return true
  return playlist.value.showPitchButtons
})
const isCompact = computed(() => cardLayout.value === 'compact')

type Row = {
  itemId: string
  entryId: string
  index: number
  title: string
  arranger: string
  lyricsHint: string
  sung: boolean
  keyShift: number
  writtenKey: string | null
  keyLabel: string
  canPayKey: boolean
  durationLabel: string
  detuneCents: number
}

const rows = computed((): Row[] => {
  const pl = playlist.value
  if (!pl) return []
  return pl.items.map((item, index) => {
    const entry = library.entries.find((e) => e.id === item.entryId)
    const keyShift = clampPitchSemitones(item.keyShift ?? 0)
    const writtenKey = entry?.key?.trim() || null
    const effective =
      writtenKey && keyShift ? transposeKeyLabel(writtenKey, keyShift) : writtenKey
    const keyLabel = effective
      ? localLibraryKeyLabel(effective)
      : writtenKey
        ? localLibraryKeyLabel(writtenKey)
        : keyShift
          ? formatKeyShiftLabel(null, keyShift)
          : 'Key'
    const durationSec = entry ? durationByEntryId.value[entry.id] : undefined
    return {
      itemId: item.id,
      entryId: item.entryId,
      index,
      title: entry?.title ?? 'Missing song',
      arranger: (entry?.arranger || '').trim(),
      lyricsHint: (entry?.lyricsHint || '').trim(),
      sung: playlists.isItemSung(pl.id, item.id),
      keyShift,
      writtenKey,
      keyLabel,
      canPayKey: !!keyToTonicNote(writtenKey),
      durationLabel: formatTrackDuration(durationSec),
      detuneCents: entry?.detuneCents ?? 0,
    }
  })
})

const availableEntries = computed(() => {
  const have = new Set(playlist.value?.items.map((i) => i.entryId) ?? [])
  return library.entries.filter((e) => !have.has(e.id))
})

const {
  dragActive,
  onHandlePointerDown,
  onDragEnter,
  rowDragClass,
  listDraggingClass,
} = useSortableListDrag<string>({
  rowSelector: 'li.set-row',
  onReorder: (itemId, toIndex) => {
    if (!playlist.value || !editing.value) return
    void playlists.reorderItem(playlist.value.id, itemId, toIndex)
  },
})

function setEditing(on: boolean): void {
  const q: Record<string, string | string[] | undefined> = { ...(route.query as Record<string, string | string[] | undefined>) }
  if (on) {
    q.edit = '1'
    delete q.focus
  } else {
    delete q.edit
    customizingPitch.value = false
  }
  void router.replace({ path: route.path, query: q })
}

async function scrollToFocus(): Promise<void> {
  const focusId = typeof route.query.focus === 'string' ? route.query.focus.trim() : ''
  if (!focusId) return
  await nextTick()
  document.getElementById(`set-item-${focusId}`)?.scrollIntoView({
    block: 'center',
    behavior: 'smooth',
  })
  const q: Record<string, string | string[] | undefined> = { ...(route.query as Record<string, string | string[] | undefined>) }
  delete q.focus
  void router.replace({ path: route.path, query: q })
}

async function ensureDuration(entryId: string): Promise<void> {
  if (entryId in durationByEntryId.value || durationBusy.has(entryId)) return
  durationBusy.add(entryId)
  try {
    const mix = pickMixTrackAsset(library.assetsFor(entryId))
    if (!mix) {
      durationByEntryId.value = { ...durationByEntryId.value, [entryId]: null }
      return
    }
    const blob = await library.getLocalAssetBlob(mix.id)
    if (!blob) {
      durationByEntryId.value = { ...durationByEntryId.value, [entryId]: null }
      return
    }
    const sec = await probeAudioDurationSeconds(blob.data, blob.mime || mix.mime)
    durationByEntryId.value = { ...durationByEntryId.value, [entryId]: sec }
  } catch {
    durationByEntryId.value = { ...durationByEntryId.value, [entryId]: null }
  } finally {
    durationBusy.delete(entryId)
  }
}

function hydrateDurations(): void {
  for (const item of playlist.value?.items ?? []) void ensureDuration(item.entryId)
}

async function hydrate(): Promise<void> {
  await Promise.all([library.ensureLoaded(), playlists.ensureLoaded()])
  if (!playlist.value) {
    await router.replace({ name: 'home' })
    return
  }
  renameDraft.value = playlist.value.name
  await scrollToFocus()
  hydrateDurations()
}

function syncPitchVoice(): void {
  pitch.setVoice(getActivePitchPipeVoice())
}

onMounted(() => {
  window.addEventListener(PITCH_PIPE_VOICE_CHANGE_EVENT, syncPitchVoice)
  void hydrate()
})

onUnmounted(() => {
  window.removeEventListener(PITCH_PIPE_VOICE_CHANGE_EVENT, syncPitchVoice)
  pitch.stop()
  pitch.dispose()
})

watch(() => props.id, () => {
  durationByEntryId.value = {}
  customizingPitch.value = false
  void hydrate()
})
watch(() => playlist.value?.name, (n) => { if (n != null) renameDraft.value = n })
watch(() => route.query.focus, () => { void scrollToFocus() })
watch(() => playlist.value?.items.map((i) => i.entryId).join(',') ?? '', () => { hydrateDurations() })

async function saveName(): Promise<void> {
  if (!playlist.value) return
  await playlists.renamePlaylist(playlist.value.id, renameDraft.value)
}

async function toggleOpenFullscreen(): Promise<void> {
  if (!playlist.value) return
  await playlists.setOpenFullscreen(playlist.value.id, !playlist.value.openFullscreen)
}

async function setCardLayout(layout: 'comfortable' | 'compact'): Promise<void> {
  if (!playlist.value) return
  await playlists.setCardLayout(playlist.value.id, layout)
}

async function toggleShowPitchButtons(): Promise<void> {
  if (!playlist.value) return
  await playlists.setShowPitchButtons(playlist.value.id, !playlist.value.showPitchButtons)
}

async function resetSung(): Promise<void> {
  if (!playlist.value) return
  await playlists.clearSung(playlist.value.id)
  snackbar.show('Sung status cleared.', { tone: 'ok' })
}

async function removeItem(itemId: string): Promise<void> {
  if (!playlist.value) return
  await playlists.removeItem(playlist.value.id, itemId)
}

async function nudgeKeyShift(itemId: string, delta: number): Promise<void> {
  if (!playlist.value) return
  const item = playlist.value.items.find((i) => i.id === itemId)
  if (!item) return
  await playlists.setItemKeyShift(
    playlist.value.id,
    itemId,
    clampPitchSemitones((item.keyShift ?? 0) + delta),
  )
}

function openSong(entryId: string, itemId: string): void {
  if (editing.value || dragActive.value || customizingPitch.value) return
  const pl = playlist.value
  if (!pl) return
  const item = pl.items.find((i) => i.id === itemId)
  const shift = clampPitchSemitones(item?.keyShift ?? 0)
  const assets = library.assetsFor(entryId)
  const hasSheet = assets.some(
    (a) => a.role === 'sheet' || a.role === 'alternateSheet' || a.role === 'image',
  )
  const wantFullscreen = pl.openFullscreen || prefs.singMode
  if (wantFullscreen && !hasSheet) {
    snackbar.show('No sheet music available.', { tone: 'info' })
  }
  const fullscreen = wantFullscreen && hasSheet
  void router.push({
    path: `/library/${entryId}`,
    query: {
      ...(fullscreen ? { fullscreen: '1' } : {}),
      playlist: pl.id,
      pitem: itemId,
      ...(shift ? { shift: String(shift) } : {}),
    },
  })
}

async function payKeyDown(row: Row): Promise<void> {
  const note = keyToTonicNote(row.writtenKey)
  if (!note) {
    snackbar.show('Set a written key on the song to pay pitch.', { tone: 'info' })
    return
  }
  const cents = row.keyShift * 100 + prefs.globalPitchDetuneCents() + row.detuneCents
  await pitch.start(note, cents)
}

function payKeyUp(): void {
  pitch.stop()
}

function togglePick(id: string): void {
  const next = new Set(pickSelected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  pickSelected.value = next
}

async function confirmAdd(): Promise<void> {
  if (!playlist.value || !pickSelected.value.size) return
  await playlists.addEntries(playlist.value.id, [...pickSelected.value])
  pickSelected.value = new Set()
  pickerOpen.value = false
}

async function destroy(): Promise<void> {
  if (!playlist.value) return
  if (!confirm(`Delete set list “${playlist.value.name}”? Songs stay in your library.`)) return
  const id = playlist.value.id
  await playlists.deletePlaylist(id)
  void router.push({ path: '/library', query: { tab: 'playlists' } })
}
</script>

<template>
  <section class="setlist" aria-label="Set list">
    <div class="top">
      <RouterLink class="btn btn-ghost back" :to="{ path: '/library', query: { tab: 'playlists' } }">
        ← Set Lists
      </RouterLink>
      <div class="actions">
        <button
          v-if="sungCount && !editing"
          type="button"
          class="btn btn-ghost"
          title="Clear sung marks"
          @click="resetSung"
        >
          Reset
        </button>
        <button v-if="!editing" type="button" class="btn" @click="setEditing(true)">Edit</button>
        <button v-else type="button" class="btn btn-primary" @click="setEditing(false)">Done</button>
      </div>
    </div>

    <p v-if="!playlist" class="muted" role="status">Opening Browse…</p>
    <template v-else>
      <header class="head">
        <label v-if="editing" class="field">
          Name
          <input v-model="renameDraft" type="text" maxlength="80" @change="saveName" />
        </label>
        <h1 v-else class="title">{{ playlist.name }}</h1>
        <p class="sub">
          {{ rows.length }} song{{ rows.length === 1 ? '' : 's'
          }}<template v-if="sungCount"> · {{ sungCount }} sung</template>
        </p>
      </header>

      <div v-if="editing" class="edit-panel">
        <div class="edit-bar">
          <button type="button" class="btn btn-primary" @click="pickerOpen = true">Add songs</button>
          <button type="button" class="btn btn-ghost danger" @click="destroy">Delete set list</button>
        </div>
        <fieldset class="edit-fieldset">
          <legend>Card layout</legend>
          <div class="seg" role="group" aria-label="Card layout">
            <button
              type="button"
              class="btn toggle"
              :class="{ on: cardLayout === 'comfortable' }"
              :aria-pressed="cardLayout === 'comfortable'"
              @click="setCardLayout('comfortable')"
            >
              Comfortable
            </button>
            <button
              type="button"
              class="btn toggle"
              :class="{ on: cardLayout === 'compact' }"
              :aria-pressed="cardLayout === 'compact'"
              @click="setCardLayout('compact')"
            >
              Compact
            </button>
          </div>
        </fieldset>
        <div class="edit-toggles">
          <button
            type="button"
            class="btn toggle"
            :class="{ on: playlist.openFullscreen }"
            :aria-pressed="playlist.openFullscreen"
            title="Open songs with sheet music in fullscreen (Sing mode also does this globally)"
            @click="toggleOpenFullscreen"
          >
            Always open fullscreen
          </button>
          <button
            type="button"
            class="btn toggle"
            :class="{ on: playlist.showPitchButtons }"
            :aria-pressed="playlist.showPitchButtons"
            title="Show pay-key chips on set list cards"
            @click="toggleShowPitchButtons"
          >
            Show pitch
          </button>
          <button
            type="button"
            class="btn toggle"
            :class="{ on: customizingPitch }"
            :aria-pressed="customizingPitch"
            title="Override pitch per song for this set list"
            @click="customizingPitch = !customizingPitch"
          >
            Customize pitch
          </button>
        </div>
        <p v-if="customizingPitch" class="hint">
          Adjust each song’s concert key for this set list. Hold the key chip to hear pitch. Opening a
          song applies the same shift.
        </p>
      </div>

      <EmptyState
        v-if="!rows.length"
        title="Empty set list"
        message="Add songs from your Local Library for a concert set."
      >
        <button v-if="editing" type="button" class="btn btn-primary" @click="pickerOpen = true">
          Add songs
        </button>
        <button v-else type="button" class="btn" @click="setEditing(true)">Edit to add songs</button>
      </EmptyState>

      <ol
        v-else
        class="list"
        :class="[listDraggingClass, { compact: isCompact }]"
        aria-label="Songs in set list"
      >
        <li
          v-for="row in rows"
          :id="`set-item-${row.itemId}`"
          :key="row.itemId"
          class="set-row"
          :data-index="row.index"
          :class="{
            sung: row.sung && !editing,
            editing: editing,
            compact: isCompact,
            'has-pitch': showPitchColumn,
            ...rowDragClass(row.itemId, row.index),
          }"
          @pointerenter="onDragEnter($event, row.index)"
        >
          <button
            v-if="editing"
            type="button"
            class="drag-handle"
            :aria-label="`Drag ${row.title} to reorder`"
            aria-roledescription="sortable"
            @pointerdown="onHandlePointerDown($event, row.itemId, row.index)"
          >
            ⠿
          </button>

          <div class="card" :class="{ compact: isCompact, 'has-pitch': showPitchColumn }">
            <button
              type="button"
              class="main"
              :disabled="editing || dragActive || customizingPitch"
              @click="openSong(row.entryId, row.itemId)"
            >
              <span v-if="!isCompact" class="n">{{ row.index + 1 }}</span>
              <span class="copy">
                <span class="headline" :title="row.arranger ? `${row.title} · ${row.arranger}` : row.title">
                  <span class="song-title">{{ row.title }}</span>
                  <template v-if="row.arranger">
                    <span class="sep" aria-hidden="true"> · </span>
                    <span class="arranger">{{ row.arranger }}</span>
                  </template>
                  <span
                    v-if="!isCompact && row.durationLabel"
                    class="duration"
                    title="Mix track length"
                  >
                    ({{ row.durationLabel }})
                  </span>
                </span>
                <template v-if="!isCompact">
                  <span v-if="row.lyricsHint" class="lyrics">{{ row.lyricsHint }}</span>
                  <span v-if="row.sung && !editing" class="pill">Sung</span>
                </template>
              </span>
            </button>

            <div v-if="showPitchColumn" class="pitch-col">
              <div v-if="editing && customizingPitch" class="pitch-edit">
                <button
                  type="button"
                  class="btn btn-ghost pitch-nudge"
                  aria-label="Lower set list pitch one semitone"
                  @click="nudgeKeyShift(row.itemId, -1)"
                >
                  −
                </button>
                <button
                  type="button"
                  class="key-chip"
                  :class="{ muted: !row.canPayKey }"
                  :disabled="!row.canPayKey"
                  :aria-label="`Pay ${row.keyLabel}`"
                  @pointerdown.prevent="payKeyDown(row)"
                  @pointerup.prevent="payKeyUp"
                  @pointerleave.prevent="payKeyUp"
                  @pointercancel.prevent="payKeyUp"
                >
                  {{ row.keyLabel }}
                  <span v-if="row.keyShift" class="shift">{{
                    row.keyShift > 0 ? `+${row.keyShift}` : row.keyShift
                  }}</span>
                </button>
                <button
                  type="button"
                  class="btn btn-ghost pitch-nudge"
                  aria-label="Raise set list pitch one semitone"
                  @click="nudgeKeyShift(row.itemId, 1)"
                >
                  +
                </button>
              </div>
              <button
                v-else
                type="button"
                class="key-chip"
                :class="{ muted: !row.canPayKey }"
                :disabled="editing || !row.canPayKey"
                :aria-label="`Pay ${row.keyLabel}`"
                :title="row.canPayKey ? 'Hold to pay the key' : 'Set a key on the song first'"
                @pointerdown.prevent="payKeyDown(row)"
                @pointerup.prevent="payKeyUp"
                @pointerleave.prevent="payKeyUp"
                @pointercancel.prevent="payKeyUp"
                @click.stop
              >
                {{ row.keyLabel }}
                <span v-if="row.keyShift" class="shift">{{
                  row.keyShift > 0 ? `+${row.keyShift}` : row.keyShift
                }}</span>
              </button>
            </div>
          </div>

          <button
            v-if="editing"
            type="button"
            class="btn btn-ghost danger remove"
            aria-label="Remove from set list"
            @click="removeItem(row.itemId)"
          >
            Remove
          </button>
        </li>
      </ol>
    </template>

    <div
      v-if="pickerOpen"
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-label="Add songs"
      @click.self="pickerOpen = false"
    >
      <div class="panel">
        <header class="panel-head">
          <h3>Add songs</h3>
          <button type="button" class="btn btn-ghost" aria-label="Close" @click="pickerOpen = false">
            ✕
          </button>
        </header>
        <ul class="pick-list">
          <li v-for="e in availableEntries" :key="e.id">
            <label class="pick">
              <input
                type="checkbox"
                :checked="pickSelected.has(e.id)"
                @change="togglePick(e.id)"
              />
              <span>{{ e.title }}</span>
            </label>
          </li>
        </ul>
        <p v-if="!availableEntries.length" class="meta">
          All library songs are already in this set list.
        </p>
        <div class="panel-actions">
          <button type="button" class="btn btn-ghost" @click="pickerOpen = false">Cancel</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!pickSelected.size"
            @click="confirmAdd"
          >
            Add {{ pickSelected.size || '' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.setlist {
  display: grid;
  gap: 0.75rem;
  width: 100%;
  max-width: 42rem;
  margin: 0 auto;
  padding: 0.25rem 0 1.5rem;
}
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.actions {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.head {
  display: grid;
  gap: 0.25rem;
}
.title {
  margin: 0;
  font-family: var(--font-display, inherit);
  font-size: 1.45rem;
  font-weight: 700;
  line-height: 1.2;
}
.sub,
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.35;
}
.field {
  display: grid;
  gap: 0.25rem;
  font-size: 0.78rem;
  font-weight: 650;
  color: var(--muted);
}
.field input {
  min-height: var(--touch, 44px);
  font: inherit;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius, 8px);
  padding: 0.35rem 0.55rem;
}
.btn.toggle.on {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  border-color: var(--accent);
  color: var(--accent-hover, var(--accent));
  font-weight: 700;
}
.edit-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}
.edit-panel {
  display: grid;
  gap: 0.55rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius, 10px);
  background: color-mix(in srgb, var(--muted) 6%, var(--surface));
}
.edit-fieldset {
  margin: 0;
  padding: 0;
  border: 0;
  display: grid;
  gap: 0.35rem;
}
.edit-fieldset legend {
  padding: 0;
  font-size: 0.78rem;
  font-weight: 650;
  color: var(--muted);
}
.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.edit-toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}
.list.compact {
  gap: 0.35rem;
}
.set-row {
  position: relative;
  display: grid;
  grid-template-columns: 1fr;
  align-items: stretch;
  border: 1px solid var(--border);
  border-radius: var(--radius, 10px);
  background: var(--surface);
  overflow: visible;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease,
    opacity 0.12s ease,
    border-color 0.12s ease,
    background 0.12s ease;
}
.set-row.compact {
  border-radius: var(--radius, 8px);
}
.set-row.editing {
  grid-template-columns: auto 1fr auto;
}
.set-row.sung {
  opacity: 0.55;
  background: color-mix(in srgb, var(--muted) 8%, var(--surface));
}
.set-row.dragging {
  z-index: 3;
  opacity: 1;
  transform: scale(1.02) translateY(-2px);
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  box-shadow: 0 10px 28px color-mix(in srgb, var(--text) 18%, transparent);
}
.set-row.dragging .drag-handle {
  color: var(--accent);
  cursor: grabbing;
}
.set-row.drop-before::before,
.set-row.drop-after::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 999px;
  background: var(--accent);
  pointer-events: none;
  z-index: 4;
}
.set-row.drop-before::before {
  top: -0.28rem;
}
.set-row.drop-after::after {
  bottom: -0.28rem;
}
.list-dragging {
  user-select: none;
  cursor: grabbing;
}
.list-dragging .set-row:not(.dragging) {
  opacity: 0.55;
}
.drag-handle {
  flex-shrink: 0;
  align-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  min-height: 44px;
  width: 40px;
  padding: 0;
  margin: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 1.05rem;
  line-height: 1;
  cursor: grab;
  touch-action: none;
}
.drag-handle:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--text) 6%, transparent);
}
.drag-handle:active {
  cursor: grabbing;
}
.card {
  display: grid;
  grid-template-columns: 1fr;
  align-items: stretch;
  min-width: 0;
  width: 100%;
}
.card.has-pitch {
  grid-template-columns: minmax(0, 1fr) auto;
}
.main {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
  text-align: left;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  padding: 0.55rem 0.75rem;
  min-height: 52px;
  width: 100%;
  min-width: 0;
}
.card.compact .main {
  align-items: center;
  padding: 0.35rem 0.55rem;
  min-height: 44px;
}
.main:disabled {
  cursor: default;
}
.main:not(:disabled):hover {
  background: color-mix(in srgb, var(--accent) 6%, var(--surface));
  color: var(--accent-hover, var(--accent));
}
.n {
  font-weight: 700;
  color: var(--muted);
  min-width: 1.5rem;
  line-height: 1.35;
  padding-top: 0.05rem;
}
.card.compact .copy {
  display: block;
  min-width: 0;
  overflow: hidden;
}
.copy {
  display: grid;
  gap: 0.12rem;
  min-width: 0;
  flex: 1;
  overflow: hidden;
}
.headline {
  display: flex;
  align-items: baseline;
  gap: 0;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  line-height: 1.35;
}
.card.compact .headline {
  /* Still one primary line; card itself stays short (≤2 lines with pitch). */
  line-height: 1.3;
}
.song-title {
  font-weight: 650;
  /* Shrink first so · arranger (+ duration) stay fully visible. */
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sep,
.arranger {
  flex: 0 0 auto;
  color: var(--muted);
  font-weight: 500;
}
.arranger {
  font-size: 0.92em;
}
.duration {
  flex: 0 0 auto;
  margin-left: 0.2rem;
  font-variant-numeric: tabular-nums;
  font-size: 0.88rem;
  font-weight: 650;
  color: var(--muted);
}
.lyrics {
  font-size: 0.95rem;
  font-style: italic;
  color: var(--text);
  opacity: 0.9;
  overflow-wrap: anywhere;
}
.pill {
  display: inline-block;
  width: fit-content;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 650;
  color: var(--muted);
  background: color-mix(in srgb, var(--muted) 14%, var(--surface));
  border: 1px solid var(--border);
}
.pitch-col {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  align-self: stretch;
  padding: 0.35rem 0.55rem 0.35rem 0.15rem;
  min-width: 0;
}
.card.compact .pitch-col {
  padding-inline: 0.35rem 0.45rem;
}
.pitch-col .key-chip {
  align-self: stretch;
  height: auto;
  min-height: 40px;
}
.card.compact .pitch-col .key-chip {
  min-height: 100%;
}
.key-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  min-height: 40px;
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--accent-hover, var(--accent));
  font: inherit;
  font-weight: 750;
  font-size: 0.98rem;
  cursor: pointer;
  touch-action: manipulation;
}
.key-chip:disabled {
  opacity: 0.45;
  cursor: default;
}
.key-chip.muted {
  background: var(--surface);
  color: var(--muted);
  font-weight: 600;
}
.key-chip .shift {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--muted);
}
.pitch-edit {
  display: inline-flex;
  align-items: center;
  align-self: stretch;
  gap: 0.2rem;
  height: 100%;
}
.pitch-nudge {
  min-width: 40px;
  min-height: 40px;
  font-size: 1.15rem;
  font-weight: 700;
}
.remove {
  align-self: center;
  margin-right: 0.35rem;
}
.danger {
  color: var(--danger, #b00020);
}
.muted {
  color: var(--muted);
}
.modal {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: end center;
  background: color-mix(in srgb, var(--text) 35%, transparent);
}
.panel {
  width: min(100%, 28rem);
  max-height: min(90vh, 36rem);
  overflow: auto;
  background: var(--surface);
  border-radius: 16px 16px 0 0;
  border: 1px solid var(--border);
  padding: 0.75rem 0.85rem 1rem;
  display: grid;
  gap: 0.65rem;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.panel-head h3 {
  margin: 0;
}
.pick-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
  max-height: 50vh;
  overflow: auto;
}
.pick {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  min-height: 44px;
}
.panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.45rem;
}
</style>
