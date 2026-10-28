<script setup lang="ts">
/**
 * Tag Studio project list.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import TagRollSeedLibraryDialog from '../components/tagRoll/TagRollSeedLibraryDialog.vue'
import { importSelectedLibrarySeeds } from '../application/tagRoll/importLibrarySeeds'
import { getTagStudioServices } from '../composition/tagStudio'
import {
  goldenOffersFromIndex,
  LILLY_LIBRARY_SEED,
  librarySeedInLibrary,
  type LibrarySeedOffer,
} from '../lib/tagRoll/librarySeeds'
import { readTagRollProjectJsonFile } from '../lib/tagRoll/projectJson'
import { readTagRollMusicXmlFile } from '../lib/tagRoll/musicxmlImport'
import { tagRollTip } from '../lib/tagRoll/shortcuts'
import { useTagRollStore } from '../stores/tagRoll'
import { useSnackbarStore } from '../stores/snackbar'

const store = useTagRollStore()
const route = useRoute()
const router = useRouter()
const snackbar = useSnackbarStore()
const importInput = ref<HTMLInputElement | null>(null)
const importMusicXmlInput = ref<HTMLInputElement | null>(null)
const importBusy = ref(false)
const seedOpen = ref(false)
const seedBusy = ref(false)
const seedOffers = ref<LibrarySeedOffer[]>([LILLY_LIBRARY_SEED])
const seedLoadError = ref('')
const seedPresentIds = computed(() =>
  seedOffers.value.filter((offer) => librarySeedInLibrary(store.summaries, offer)).map((o) => o.id),
)

/** Grace period after Yes, before the arrangement is actually removed. */
const DELETE_GRACE_MS = 5000
const pendingConfirm = ref<{ id: string; title: string } | null>(null)
const deletingIds = ref<string[]>([])
const pendingDeletes = new Map<string, { title: string; timer: ReturnType<typeof setTimeout> }>()
let listAlive = true

function isDeleting(id: string): boolean {
  return deletingIds.value.includes(id)
}

const MILL_LAB_FILES = [
  'mill-ground.json',
  'mill-bass-sparse.json',
  'mill-tenor-sparse.json',
  'mill-bass-filled.json',
  'mill-tenor-filled.json',
] as const

const SPARSE_LAB_FILES = [
  'rose-ground.json',
  'rose-bass-sparse.json',
  'rose-tenor-sparse.json',
  'rose-bass-filled.json',
  'rose-tenor-filled.json',
  'shine-ground.json',
  'shine-bass-sparse.json',
  'shine-tenor-sparse.json',
  'shine-bass-filled.json',
  'shine-tenor-filled.json',
] as const

onMounted(() => {
  void (async () => {
    if (route.query.millLab === '1') {
      try {
        await store.refreshList()
        let added = 0
        for (const file of MILL_LAB_FILES) {
          const res = await fetch(`/mill-stream-lab/${file}?t=${Date.now()}`)
          if (!res.ok) throw new Error(file)
          const raw = (await res.json()) as { id: string }
          await store.importProject(raw as never)
          added++
        }
        snackbar.show(
          `Updated ${added} Mill Stream charts (full, Lead+Bass, Lead+Tenor, and both fills).`,
          { title: 'Tag Studio', tone: 'ok', ms: 6000 },
        )
      } catch (e) {
        snackbar.show(e instanceof Error ? e.message : 'Mill Stream lab import failed', {
          title: 'Tag Studio',
          tone: 'error',
          ms: 6000,
        })
      }
      const q = { ...route.query }
      delete q.millLab
      await router.replace({ query: q })
      return
    }
    if (route.query.sparseLab === '1') {
      try {
        await store.refreshList()
        let added = 0
        for (const file of SPARSE_LAB_FILES) {
          const res = await fetch(`/sparse-lab/${file}?t=${Date.now()}`)
          if (!res.ok) throw new Error(file)
          const raw = (await res.json()) as { id: string }
          await store.importProject(raw as never)
          added++
        }
        snackbar.show(
          `Updated ${added} Story of a Rose and Shine On Me charts (full, Lead+Bass, Lead+Tenor, and both fills).`,
          { title: 'Tag Studio', tone: 'ok', ms: 6000 },
        )
      } catch (e) {
        snackbar.show(e instanceof Error ? e.message : 'Sparse lab import failed', {
          title: 'Tag Studio',
          tone: 'error',
          ms: 6000,
        })
      }
      const q = { ...route.query }
      delete q.sparseLab
      await router.replace({ query: q })
      return
    }
    const resync =
      route.query.resyncSeeds === '1' ||
      route.query.resyncSeeds === 'true' ||
      route.query.resyncPolecat === '1'
    if (resync) {
      const { clearedDismissals } = await store.resyncPolecatPitchSeeds()
      const n = store.summaries.filter((s) => s.id.startsWith('seed-polecat-pitch-')).length
      snackbar.show(
        `Polecat seeds: ${n} in library` +
          (clearedDismissals ? ` (cleared ${clearedDismissals} dismissals)` : ''),
        { title: 'Tag Studio', tone: 'success', ms: 4500 },
      )
      const q = { ...route.query }
      delete q.resyncSeeds
      delete q.resyncPolecat
      await router.replace({ query: q })
      return
    }
    await store.refreshList()
  })()
})

async function openSeedLibrary(): Promise<void> {
  seedLoadError.value = ''
  seedOffers.value = [LILLY_LIBRARY_SEED]
  try {
    const res = await fetch('/tag-studio/polecat-mixed-seeds/index.json', { cache: 'no-cache' })
    if (!res.ok) throw new Error('index')
    const songs = goldenOffersFromIndex(await res.json())
    seedOffers.value = [LILLY_LIBRARY_SEED, ...songs]
    if (!songs.length) {
      seedLoadError.value = 'The golden songs could not be loaded. Lilly Marlene is still available.'
    }
  } catch {
    seedLoadError.value = 'The golden songs could not be loaded. Lilly Marlene is still available.'
  }
  seedOpen.value = true
}

async function onLoadSeeds(ids: string[]): Promise<void> {
  if (seedBusy.value || !ids.length) return
  seedBusy.value = true
  try {
    const { repository, clock } = getTagStudioServices()
    const result = await importSelectedLibrarySeeds(repository, clock, seedOffers.value, ids)
    await store.refreshList()
    if (result.errors.length) {
      seedLoadError.value = result.errors.join(' ')
    }
    if (result.imported.length) {
      const n = result.imported.length
      snackbar.show(`Added ${n} chart${n === 1 ? '' : 's'} to the library.`, {
        title: 'Tag Studio',
        tone: 'ok',
        ms: 3500,
      })
    } else if (!result.errors.length) {
      snackbar.show('Those charts are already in the library.', {
        title: 'Tag Studio',
        tone: 'ok',
        ms: 3000,
      })
    }
    if (!result.errors.length) seedOpen.value = false
  } catch (e) {
    seedLoadError.value = e instanceof Error ? e.message : 'Could not add those charts'
  } finally {
    seedBusy.value = false
  }
}

async function onCreate(): Promise<void> {
  try {
    const p = await store.createProject()
    await router.push({ name: 'tag-studio-edit', params: { id: p.id } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to create project'
    snackbar.show(msg, { title: 'Error', tone: 'error', ms: 4000 })
    console.error('Failed to create project:', e)
  }
}

function onImportClick(): void {
  importInput.value?.click()
}

function onImportMusicXmlClick(): void {
  importMusicXmlInput.value?.click()
}

async function onImportFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || importBusy.value) return
  importBusy.value = true
  try {
    const parsed = await readTagRollProjectJsonFile(file)
    if (!parsed.ok) {
      snackbar.show(parsed.error, { title: 'Import failed', tone: 'error', ms: 4000 })
      return
    }
    const p = await store.importProject(parsed.project)
    snackbar.show(`Imported “${p.title}”`, { title: 'Imported', tone: 'ok', ms: 2500 })
    await router.push({ name: 'tag-studio-edit', params: { id: p.id } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to import project'
    snackbar.show(msg, { title: 'Import failed', tone: 'error', ms: 4000 })
    console.error('Failed to import project:', err)
  } finally {
    importBusy.value = false
  }
}

async function onImportMusicXmlFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || importBusy.value) return
  importBusy.value = true
  try {
    const parsed = await readTagRollMusicXmlFile(file)
    if (!parsed.ok) {
      snackbar.show(parsed.error, { title: 'MusicXML import failed', tone: 'error', ms: 4500 })
      return
    }
    const p = await store.importProject(parsed.project)
    snackbar.show(`Imported “${p.title}” from MusicXML`, {
      title: 'Imported',
      tone: 'ok',
      ms: 2500,
    })
    await router.push({ name: 'tag-studio-edit', params: { id: p.id } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to import MusicXML'
    snackbar.show(msg, { title: 'MusicXML import failed', tone: 'error', ms: 4500 })
    console.error('Failed to import MusicXML:', err)
  } finally {
    importBusy.value = false
  }
}

async function onDelete(id: string, title: string): Promise<void> {
  if (isDeleting(id)) return
  pendingConfirm.value = { id, title }
}

function confirmDelete(): void {
  const target = pendingConfirm.value
  pendingConfirm.value = null
  if (!target || isDeleting(target.id)) return
  const existing = pendingDeletes.get(target.id)
  if (existing) clearTimeout(existing.timer)
  deletingIds.value = [...deletingIds.value.filter((id) => id !== target.id), target.id]
  const timer = setTimeout(() => {
    void commitDelete(target.id)
  }, DELETE_GRACE_MS)
  pendingDeletes.set(target.id, { title: target.title, timer })
  const count = pendingDeletes.size
  const msg =
    count === 1
      ? `“${target.title}” will be deleted in a few seconds.`
      : `${count} arrangements will be deleted in a few seconds.`
  snackbar.show(msg, {
    title: 'Deleting',
    tone: 'info',
    ms: DELETE_GRACE_MS,
    action: { label: 'Undo', onClick: undoPendingDeletes },
  })
}

function undoPendingDeletes(): void {
  for (const row of pendingDeletes.values()) clearTimeout(row.timer)
  pendingDeletes.clear()
  deletingIds.value = []
}

async function commitDelete(id: string): Promise<void> {
  const row = pendingDeletes.get(id)
  if (!row) return
  pendingDeletes.delete(id)
  if (listAlive) deletingIds.value = deletingIds.value.filter((item) => item !== id)
  const title = row.title
  try {
    await store.removeProject(id)
    if (snackbar.message?.includes(title)) snackbar.dismiss()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to delete project'
    snackbar.show(msg, { title: 'Error', tone: 'error', ms: 4000 })
  }
}

onUnmounted(() => {
  listAlive = false
})

async function onDuplicate(id: string, title: string): Promise<void> {
  try {
    const p = await store.duplicateProject(id)
    snackbar.show(`Duplicated “${title}”`, { title: 'Duplicated', tone: 'ok', ms: 2500 })
    await router.push({ name: 'tag-studio-edit', params: { id: p.id } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to duplicate project'
    snackbar.show(msg, { title: 'Error', tone: 'error', ms: 4000 })
  }
}

function fmtDate(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return ''
  }
}
</script>

<template>
  <section class="tr-list" aria-label="Tag Studio projects">
    <header class="head">
      <div class="head-text">
        <p class="crumb">
          <RouterLink to="/labs">Labs</RouterLink>
          <span aria-hidden="true"> → </span>
          Tag Studio
        </p>
        <h1 class="title">Tag Studio</h1>
        <p class="lead">
          Create and arrange custom tag arrangements on a piano-roll grid. Import
          <strong>SingTags JSON</strong> or <strong>MusicXML</strong> here, or from Export ▾ inside a
          project.
        </p>
      </div>
      <div class="head-actions">
        <input
          ref="importInput"
          class="sr-only"
          type="file"
          accept="application/json,.json"
          aria-label="Import SingTags JSON project"
          @change="onImportFile"
        />
        <input
          ref="importMusicXmlInput"
          class="sr-only"
          type="file"
          accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/xml,text/xml"
          aria-label="Import MusicXML project"
          @change="onImportMusicXmlFile"
        />
        <button
          type="button"
          class="btn"
          :disabled="importBusy || seedBusy"
          :title="tagRollTip('Choose Lilly Marlene and golden songs to add to this library')"
          @click="openSeedLibrary"
        >
          Examples
        </button>
        <button
          type="button"
          class="btn"
          :disabled="importBusy"
          :title="tagRollTip('Import a SingTags Tag Studio JSON project')"
          @click="onImportClick"
        >
          {{ importBusy ? 'Importing…' : 'Import JSON' }}
        </button>
        <button
          type="button"
          class="btn"
          :disabled="importBusy"
          :title="tagRollTip('Import MusicXML (.musicxml / .mxl) as a new project')"
          @click="onImportMusicXmlClick"
        >
          Import MusicXML
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :title="tagRollTip('Create a new Tag Studio project')"
          @click="onCreate"
        >
          New project
        </button>
      </div>
    </header>

    <TagRollSeedLibraryDialog
      :open="seedOpen"
      :offers="seedOffers"
      :present-ids="seedPresentIds"
      :busy="seedBusy"
      :load-error="seedLoadError"
      @close="seedOpen = false"
      @load="onLoadSeeds"
    />

    <p v-if="store.error" class="err" role="alert">{{ store.error }}</p>

    <ul v-if="store.summaries.length" class="list" role="list">
      <li
        v-for="s in store.summaries"
        :key="s.id"
        class="row"
        :class="{ deleting: isDeleting(s.id) }"
      >
        <RouterLink
          class="row-main"
          :to="{ name: 'tag-studio-edit', params: { id: s.id } }"
          :title="tagRollTip(`Open ${s.title}`)"
          @click="isDeleting(s.id) && $event.preventDefault()"
        >
          <span class="row-title">{{ s.title }}</span>
          <span v-if="isDeleting(s.id)" class="row-meta">Deleting…</span>
          <span v-else class="row-meta">
            {{ s.bpm }} BPM · {{ s.noteCount }} note{{ s.noteCount === 1 ? '' : 's' }} ·
            {{ fmtDate(s.updatedAt) }}
          </span>
        </RouterLink>
        <button
          type="button"
          class="btn ghost"
          :disabled="isDeleting(s.id)"
          :aria-label="`Duplicate ${s.title}`"
          :title="tagRollTip(`Duplicate ${s.title}`)"
          @click="onDuplicate(s.id, s.title)"
        >
          Duplicate
        </button>
        <button
          type="button"
          class="btn ghost"
          :disabled="isDeleting(s.id)"
          :aria-label="`Delete ${s.title}`"
          :title="tagRollTip(`Delete ${s.title}`)"
          @click="onDelete(s.id, s.title)"
        >
          Delete
        </button>
      </li>
    </ul>
    <p v-else-if="store.loaded" class="empty">
      No projects yet. Create one to open the piano roll.
    </p>
    <ConfirmDialog
      :open="!!pendingConfirm"
      title="Are you sure?"
      :message="pendingConfirm ? `Delete “${pendingConfirm.title}”? It stays in your library for a few seconds so you can undo.` : ''"
      confirm-label="Yes"
      cancel-label="Cancel"
      @close="pendingConfirm = null"
      @confirm="confirmDelete"
    />
  </section>
</template>

<style scoped>
.tr-list {
  display: grid;
  gap: 1rem;
  max-width: 42rem;
  padding: 0.25rem 0 2rem;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}
.head-text {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
}
.head-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}
.crumb {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted);
}
.crumb a {
  color: var(--accent);
}
.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.65rem;
  line-height: 1.15;
}
.lead {
  margin: 0;
  color: var(--muted);
  font-size: 0.95rem;
}
.err {
  margin: 0;
  color: var(--danger, #b42318);
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
}
.row.deleting {
  opacity: 0.55;
}
.row-main {
  flex: 1 1 auto;
  min-width: 0;
  display: grid;
  gap: 0.15rem;
  text-decoration: none;
  color: inherit;
}
.row-title {
  font-weight: 650;
}
.row-meta {
  font-size: 0.85rem;
  color: var(--muted);
}
.empty {
  margin: 0;
  color: var(--muted);
  font-size: 0.95rem;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
