/**
 * Pinia store for Sing Together repertoire (local device).
 */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { parseRepertoireCsv, type RepertoireCsvColumn } from '../lib/singTogether/csv'
import { loadStoredProfile, saveStoredProfile } from '../lib/singTogether/storage'
import {
  clampConfidence,
  emptyProfile,
  newCollectionId,
  newSongId,
  normalizeAltTitles,
  type Confidence,
  type RepertoireCollection,
  type RepertoireProfile,
  type RepertoireSong,
} from '../lib/singTogether/types'

export type ImportTitlesResult = {
  added: number
  skipped: number
  duplicates: number
}

/** One song drafted during Import from My Library (step 2). */
export type LibraryImportDraft = {
  entryId: string
  title: string
  arranger: string
  key?: string
  voicing?: RepertoireSong['voicing']
  parts: Record<string, Confidence>
}

/** Library fields used as source of truth while `localEntryId` is linked. */
export type LibrarySourceFields = {
  title: string
  arranger: string
  key?: string | null
}

/** Split pasted choir lists into titles (newlines primary; `/` and `;` within a line). */
export function parseTitleList(raw: string): { titles: string[]; skipped: number } {
  if (!raw.trim()) return { titles: [], skipped: 0 }
  const titles: string[] = []
  let skipped = 0
  for (const line of raw.split(/\r?\n/)) {
    for (const chunk of line.split(/[;/]/)) {
      const t = chunk.trim()
      if (!t) {
        skipped++
        continue
      }
      titles.push(t)
    }
  }
  return { titles, skipped }
}

function nowIso(): string {
  return new Date().toISOString()
}

function pruneSongIds(collections: RepertoireCollection[], alive: Set<string>): RepertoireCollection[] {
  return collections.map((c) => ({
    ...c,
    songIds: c.songIds.filter((id) => alive.has(id)),
  }))
}

export const useSingTogetherStore = defineStore('singTogether', () => {
  const profile = ref<RepertoireProfile>(loadStoredProfile())

  watch(
    profile,
    (v) => {
      saveStoredProfile(v)
    },
    { deep: true, flush: 'sync' },
  )

  const songCount = computed(() => profile.value.songs.length)
  const collections = computed(() => profile.value.collections)

  function setDisplayName(name: string): void {
    // Keep spaces/special chars while typing; trim only when packing the QR.
    profile.value = { ...profile.value, displayName: name.slice(0, 64) }
  }

  function upsertSong(song: Omit<RepertoireSong, 'id'> & { id?: string }): void {
    const id = song.id || newSongId()
    const tagId =
      typeof song.tagId === 'number' && Number.isFinite(song.tagId) && song.tagId > 0
        ? Math.floor(song.tagId)
        : undefined
    const localEntryId =
      typeof song.localEntryId === 'string' && song.localEntryId.trim()
        ? song.localEntryId.trim()
        : undefined
    const next: RepertoireSong = {
      id,
      title: song.title.trim(),
      altTitles: normalizeAltTitles(song.altTitles),
      arranger: song.arranger.trim(),
      key: song.key?.trim() || undefined,
      voicing: song.voicing,
      parts: { ...song.parts },
      isTag: song.isTag === true ? true : undefined,
      tagId,
      localEntryId,
    }
    const idx = profile.value.songs.findIndex((s) => s.id === id)
    const songs = [...profile.value.songs]
    if (idx >= 0) songs[idx] = next
    else songs.push(next)
    profile.value = { ...profile.value, songs }
  }

  function removeSong(id: string): void {
    const songs = profile.value.songs.filter((s) => s.id !== id)
    const alive = new Set(songs.map((s) => s.id))
    profile.value = {
      ...profile.value,
      songs,
      collections: pruneSongIds(profile.value.collections, alive),
    }
  }

  function setPartConfidence(songId: string, partId: string, confidence: Confidence | null): void {
    const songs = profile.value.songs.map((s) => {
      if (s.id !== songId) return s
      const parts = { ...s.parts }
      if (confidence == null) delete parts[partId]
      else parts[partId] = clampConfidence(confidence)
      return { ...s, parts }
    })
    profile.value = { ...profile.value, songs }
  }

  function importCsv(text: string): { added: number; skipped: number; errors: string[] } {
    const result = parseRepertoireCsv(text)
    if (result.songs.length) {
      profile.value = {
        ...profile.value,
        songs: [...profile.value.songs, ...result.songs],
      }
    }
    return { added: result.songs.length, skipped: result.skipped, errors: result.errors }
  }

  /**
   * Paste songs as CSV-shaped rows (commas + newlines).
   * `columns` sets left-to-right field order when there is no header row.
   * Dedupes by title (case-insensitive) against existing songs and within the paste.
   */
  function importPaste(
    text: string,
    columns?: readonly RepertoireCsvColumn[],
  ): ImportTitlesResult & { errors: string[] } {
    const result = parseRepertoireCsv(text, columns?.length ? { columns } : undefined)
    const seen = new Set(
      profile.value.songs.map((s) => s.title.trim().toLowerCase()).filter(Boolean),
    )
    const accepted: typeof result.songs = []
    let duplicates = 0
    for (const song of result.songs) {
      const key = song.title.trim().toLowerCase()
      if (!key) continue
      if (seen.has(key)) {
        duplicates++
        continue
      }
      seen.add(key)
      accepted.push(song)
    }
    if (accepted.length) {
      profile.value = {
        ...profile.value,
        songs: [...profile.value.songs, ...accepted],
      }
    }
    return {
      added: accepted.length,
      skipped: result.skipped,
      duplicates,
      errors: result.errors,
    }
  }

  /**
   * Import My Library entries into repertoire.
   * Dedupes by existing `localEntryId` (same library song already imported).
   * Title/arranger/key come from the library draft; voicing/parts are ST-local.
   */
  function importFromLibrary(drafts: readonly LibraryImportDraft[]): ImportTitlesResult {
    const linked = new Set(
      profile.value.songs
        .map((s) => s.localEntryId?.trim())
        .filter((id): id is string => !!id),
    )
    const accepted: RepertoireSong[] = []
    let duplicates = 0
    let skipped = 0
    for (const d of drafts) {
      const entryId = typeof d.entryId === 'string' ? d.entryId.trim() : ''
      const title = typeof d.title === 'string' ? d.title.trim() : ''
      if (!entryId || !title) {
        skipped++
        continue
      }
      if (linked.has(entryId)) {
        duplicates++
        continue
      }
      linked.add(entryId)
      accepted.push({
        id: newSongId(),
        title,
        arranger: typeof d.arranger === 'string' ? d.arranger.trim() : '',
        key: typeof d.key === 'string' && d.key.trim() ? d.key.trim() : undefined,
        voicing: d.voicing,
        parts: { ...(d.parts ?? {}) },
        localEntryId: entryId,
      })
    }
    if (accepted.length) {
      profile.value = {
        ...profile.value,
        songs: [...profile.value.songs, ...accepted],
      }
    }
    return { added: accepted.length, skipped, duplicates }
  }

  /**
   * Keep linked songs’ title/arranger/key in sync with My Library.
   * Missing library entries are unlinked (fields stay editable with last known values).
   */
  function syncLinkedLibrarySongs(
    entriesById: ReadonlyMap<string, LibrarySourceFields>,
  ): { synced: number; unlinked: number } {
    let synced = 0
    let unlinked = 0
    let changed = false
    const songs = profile.value.songs.map((s) => {
      const entryId = s.localEntryId?.trim()
      if (!entryId) return s
      const entry = entriesById.get(entryId)
      if (!entry) {
        unlinked++
        changed = true
        return { ...s, localEntryId: undefined }
      }
      const title = entry.title.trim()
      const arranger = entry.arranger.trim()
      const key = entry.key?.trim() || undefined
      if (s.title === title && s.arranger === arranger && (s.key || undefined) === key) {
        return s
      }
      synced++
      changed = true
      return { ...s, title, arranger, key }
    })
    if (changed) profile.value = { ...profile.value, songs }
    return { synced, unlinked }
  }

  /** Add a titled stub with empty parts (title required). */
  function addTitleOnlySong(title: string): string {
    const t = title.trim()
    if (!t) return ''
    const id = newSongId()
    upsertSong({
      id,
      title: t,
      arranger: '',
      parts: {},
    })
    return id
  }

  /**
   * Bulk-create title-only songs from a pasted list.
   * Dedupes case-insensitively against existing titles and within the paste.
   */
  function importTitles(raw: string): ImportTitlesResult {
    const { titles, skipped } = parseTitleList(raw)
    const seen = new Set(profile.value.songs.map((s) => s.title.trim().toLowerCase()).filter(Boolean))
    let added = 0
    let duplicates = 0
    for (const title of titles) {
      const key = title.toLowerCase()
      if (seen.has(key)) {
        duplicates++
        continue
      }
      seen.add(key)
      if (addTitleOnlySong(title)) added++
    }
    return { added, skipped, duplicates }
  }

  function clearSongs(): void {
    profile.value = {
      ...profile.value,
      songs: [],
      collections: profile.value.collections.map((c) => ({
        ...c,
        songIds: [],
        updatedAt: nowIso(),
      })),
    }
  }

  function collectionById(id: string): RepertoireCollection | undefined {
    return profile.value.collections.find((c) => c.id === id)
  }

  function validateCollectionName(name: string, exceptId?: string): string | null {
    const t = name.trim()
    if (!t) return 'Enter a collection name'
    if (t.length > 80) return 'Name is too long'
    const key = t.toLowerCase()
    if (
      profile.value.collections.some(
        (c) => c.id !== exceptId && c.name.trim().toLowerCase() === key,
      )
    ) {
      return 'A collection with that name already exists'
    }
    return null
  }

  function createCollection(name: string, songIds: string[] = []): RepertoireCollection | null {
    if (validateCollectionName(name)) return null
    const alive = new Set(profile.value.songs.map((s) => s.id))
    const ids: string[] = []
    const seen = new Set<string>()
    for (const id of songIds) {
      if (!alive.has(id) || seen.has(id)) continue
      seen.add(id)
      ids.push(id)
    }
    const stamp = nowIso()
    const col: RepertoireCollection = {
      id: newCollectionId(),
      name: name.trim(),
      songIds: ids,
      createdAt: stamp,
      updatedAt: stamp,
    }
    profile.value = {
      ...profile.value,
      collections: [...profile.value.collections, col],
    }
    return col
  }

  function renameCollection(id: string, name: string): boolean {
    if (validateCollectionName(name, id)) return false
    const t = name.trim()
    const collections = profile.value.collections.map((c) =>
      c.id === id ? { ...c, name: t, updatedAt: nowIso() } : c,
    )
    profile.value = { ...profile.value, collections }
    return true
  }

  function removeCollection(id: string): void {
    profile.value = {
      ...profile.value,
      collections: profile.value.collections.filter((c) => c.id !== id),
    }
  }

  function moveCollection(id: string, toIndex: number): boolean {
    const from = profile.value.collections.findIndex((c) => c.id === id)
    if (from < 0) return false
    const clamped = Math.max(0, Math.min(profile.value.collections.length - 1, toIndex))
    if (from === clamped) return true
    const next = [...profile.value.collections]
    const [item] = next.splice(from, 1)
    next.splice(clamped, 0, item!)
    profile.value = { ...profile.value, collections: next }
    return true
  }

  function addSongsToCollection(collectionId: string, songIds: string[]): void {
    const alive = new Set(profile.value.songs.map((s) => s.id))
    const collections = profile.value.collections.map((c) => {
      if (c.id !== collectionId) return c
      const next = [...c.songIds]
      const have = new Set(next)
      for (const id of songIds) {
        if (!alive.has(id) || have.has(id)) continue
        have.add(id)
        next.push(id)
      }
      return { ...c, songIds: next, updatedAt: nowIso() }
    })
    profile.value = { ...profile.value, collections }
  }

  function removeSongsFromCollection(collectionId: string, songIds: string[]): void {
    const drop = new Set(songIds)
    const collections = profile.value.collections.map((c) => {
      if (c.id !== collectionId) return c
      return {
        ...c,
        songIds: c.songIds.filter((id) => !drop.has(id)),
        updatedAt: nowIso(),
      }
    })
    profile.value = { ...profile.value, collections }
  }

  /** Replace All-list order (custom order for the full repertoire). */
  function setSongOrder(songIds: string[]): void {
    const byId = new Map(profile.value.songs.map((s) => [s.id, s]))
    const next: RepertoireSong[] = []
    const seen = new Set<string>()
    for (const id of songIds) {
      const s = byId.get(id)
      if (!s || seen.has(id)) continue
      seen.add(id)
      next.push(s)
    }
    for (const s of profile.value.songs) {
      if (!seen.has(s.id)) next.push(s)
    }
    profile.value = { ...profile.value, songs: next }
  }

  function setCollectionSongOrder(collectionId: string, songIds: string[]): void {
    const alive = new Set(profile.value.songs.map((s) => s.id))
    const collections = profile.value.collections.map((c) => {
      if (c.id !== collectionId) return c
      const next: string[] = []
      const seen = new Set<string>()
      for (const id of songIds) {
        if (!alive.has(id) || seen.has(id)) continue
        seen.add(id)
        next.push(id)
      }
      for (const id of c.songIds) {
        if (!seen.has(id) && alive.has(id)) next.push(id)
      }
      return { ...c, songIds: next, updatedAt: nowIso() }
    })
    profile.value = { ...profile.value, collections }
  }

  /**
   * Move a song within All order, or within a collection when `collectionId` is set.
   */
  function reorderSong(songId: string, toIndex: number, collectionId: string | null = null): void {
    if (collectionId) {
      const col = collectionById(collectionId)
      if (!col) return
      const from = col.songIds.indexOf(songId)
      if (from < 0) return
      const ids = [...col.songIds]
      ids.splice(from, 1)
      const clamped = Math.max(0, Math.min(toIndex, ids.length))
      ids.splice(clamped, 0, songId)
      setCollectionSongOrder(collectionId, ids)
      return
    }
    const from = profile.value.songs.findIndex((s) => s.id === songId)
    if (from < 0) return
    const songs = [...profile.value.songs]
    const [row] = songs.splice(from, 1)
    if (!row) return
    const clamped = Math.max(0, Math.min(toIndex, songs.length))
    songs.splice(clamped, 0, row)
    profile.value = { ...profile.value, songs }
  }

  function replaceProfile(next: RepertoireProfile): void {
    const normalized = {
      displayName: next.displayName,
      songs: next.songs,
      collections: Array.isArray(next.collections) ? next.collections : [],
      updatedAt: Date.now(),
    }
    const alive = new Set(normalized.songs.map((s) => s.id))
    profile.value = {
      ...normalized,
      collections: pruneSongIds(normalized.collections, alive),
    }
  }

  function resetAll(): void {
    profile.value = emptyProfile()
  }

  return {
    profile,
    songCount,
    collections,
    setDisplayName,
    upsertSong,
    removeSong,
    setPartConfidence,
    importCsv,
    importPaste,
    importFromLibrary,
    syncLinkedLibrarySongs,
    importTitles,
    addTitleOnlySong,
    clearSongs,
    collectionById,
    validateCollectionName,
    createCollection,
    renameCollection,
    removeCollection,
    moveCollection,
    addSongsToCollection,
    removeSongsFromCollection,
    setSongOrder,
    setCollectionSongOrder,
    reorderSong,
    replaceProfile,
    resetAll,
  }
})
