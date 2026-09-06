/**
 * Pinia store for Local Library concert set lists.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { LocalPlaylist, LocalPlaylistItem } from '../types/localLibrary'
import { normalizeLocalPlaylist } from '../types/localLibrary'
import {
  deleteLocalPlaylist,
  getLocalPlaylist,
  listLocalPlaylists,
  newLocalId,
  putLocalPlaylist,
} from '../offline/localLibraryDb'

function blankPlaylist(name: string): LocalPlaylist {
  const now = new Date().toISOString()
  return {
    id: newLocalId('lp'),
    name: name.trim() || 'Set List',
    createdAt: now,
    updatedAt: now,
    openFullscreen: true,
    showPitchButtons: true,
    cardLayout: 'comfortable',
    sungItemIds: [],
    items: [],
  }
}

export const useLocalPlaylistsStore = defineStore('localPlaylists', () => {
  const playlists = ref<LocalPlaylist[]>([])
  const loaded = ref(false)
  const loading = ref(false)

  const sorted = computed(() =>
    [...playlists.value].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
  )

  async function ensureLoaded(): Promise<void> {
    if (loaded.value || loading.value) return
    loading.value = true
    try {
      playlists.value = (await listLocalPlaylists()).map(normalizeLocalPlaylist)
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  async function refresh(): Promise<void> {
    loaded.value = false
    await ensureLoaded()
  }

  function byId(id: string): LocalPlaylist | undefined {
    return playlists.value.find((p) => p.id === id)
  }

  async function createPlaylist(name: string): Promise<LocalPlaylist> {
    await ensureLoaded()
    const playlist = blankPlaylist(name)
    await putLocalPlaylist(playlist)
    playlists.value = [...playlists.value, playlist]
    return playlist
  }

  async function renamePlaylist(id: string, name: string): Promise<void> {
    const cur = byId(id) ?? (await getLocalPlaylist(id))
    if (!cur) return
    const next = {
      ...cur,
      name: name.trim() || cur.name,
      updatedAt: new Date().toISOString(),
    }
    await putLocalPlaylist(next)
    playlists.value = playlists.value.map((p) => (p.id === id ? next : p))
  }

  async function setOpenFullscreen(id: string, on: boolean): Promise<void> {
    const cur = byId(id) ?? (await getLocalPlaylist(id))
    if (!cur) return
    const next = { ...cur, openFullscreen: on, updatedAt: new Date().toISOString() }
    await putLocalPlaylist(next)
    playlists.value = playlists.value.map((p) => (p.id === id ? next : p))
  }

  async function setShowPitchButtons(id: string, on: boolean): Promise<void> {
    const cur = byId(id) ?? (await getLocalPlaylist(id))
    if (!cur) return
    const pl = normalizeLocalPlaylist(cur)
    const next = {
      ...pl,
      showPitchButtons: on,
      updatedAt: new Date().toISOString(),
    }
    await putLocalPlaylist(next)
    playlists.value = playlists.value.map((p) => (p.id === id ? next : p))
  }

  async function setCardLayout(
    id: string,
    cardLayout: LocalPlaylist['cardLayout'],
  ): Promise<void> {
    const cur = byId(id) ?? (await getLocalPlaylist(id))
    if (!cur) return
    const pl = normalizeLocalPlaylist(cur)
    const next = {
      ...pl,
      cardLayout: cardLayout === 'compact' ? 'compact' : 'comfortable',
      updatedAt: new Date().toISOString(),
    }
    await putLocalPlaylist(next)
    playlists.value = playlists.value.map((p) => (p.id === id ? next : p))
  }

  async function deletePlaylist(id: string): Promise<void> {
    await deleteLocalPlaylist(id)
    playlists.value = playlists.value.filter((p) => p.id !== id)
  }

  async function setItems(id: string, items: LocalPlaylistItem[]): Promise<void> {
    const cur = byId(id) ?? (await getLocalPlaylist(id))
    if (!cur) return
    const pl = normalizeLocalPlaylist(cur)
    const keep = new Set(items.map((i) => i.id))
    const next = {
      ...pl,
      items: items.map((it) => ({ ...it })),
      sungItemIds: pl.sungItemIds.filter((sid) => keep.has(sid)),
      updatedAt: new Date().toISOString(),
    }
    await putLocalPlaylist(next)
    playlists.value = playlists.value.map((p) => (p.id === id ? next : p))
  }

  async function addEntries(id: string, entryIds: string[]): Promise<void> {
    const cur = byId(id) ?? (await getLocalPlaylist(id))
    if (!cur) return
    const have = new Set(cur.items.map((i) => i.entryId))
    const additions: LocalPlaylistItem[] = []
    for (const entryId of entryIds) {
      if (have.has(entryId)) continue
      have.add(entryId)
      additions.push({ id: newLocalId('lpi'), entryId })
    }
    if (!additions.length) return
    await setItems(id, [...cur.items, ...additions])
  }

  async function removeItem(id: string, itemId: string): Promise<void> {
    const cur = byId(id) ?? (await getLocalPlaylist(id))
    if (!cur) return
    await setItems(
      id,
      cur.items.filter((i) => i.id !== itemId),
    )
  }

  async function reorderItem(id: string, itemId: string, toIndex: number): Promise<void> {
    const cur = byId(id) ?? (await getLocalPlaylist(id))
    if (!cur) return
    const pl = normalizeLocalPlaylist(cur)
    const items = [...pl.items]
    const from = items.findIndex((i) => i.id === itemId)
    if (from < 0) return
    const [row] = items.splice(from, 1)
    const clamped = Math.max(0, Math.min(items.length, toIndex))
    items.splice(clamped, 0, row!)
    await setItems(id, items)
  }

  async function markItemSung(id: string, itemId: string): Promise<void> {
    const cur = byId(id) ?? (await getLocalPlaylist(id))
    if (!cur) return
    const pl = normalizeLocalPlaylist(cur)
    if (pl.sungItemIds.includes(itemId)) return
    const next = {
      ...pl,
      sungItemIds: [...pl.sungItemIds, itemId],
      updatedAt: new Date().toISOString(),
    }
    await putLocalPlaylist(next)
    playlists.value = playlists.value.map((p) => (p.id === id ? next : p))
  }

  async function clearSung(id: string): Promise<void> {
    const cur = byId(id) ?? (await getLocalPlaylist(id))
    if (!cur) return
    const pl = normalizeLocalPlaylist(cur)
    if (!pl.sungItemIds.length) return
    const next = { ...pl, sungItemIds: [], updatedAt: new Date().toISOString() }
    await putLocalPlaylist(next)
    playlists.value = playlists.value.map((p) => (p.id === id ? next : p))
  }


  async function setItemKeyShift(id: string, itemId: string, keyShift: number): Promise<void> {
    const cur = byId(id) ?? (await getLocalPlaylist(id))
    if (!cur) return
    const pl = normalizeLocalPlaylist(cur)
    const shift = Math.max(-12, Math.min(12, Math.round(keyShift)))
    const items = pl.items.map((it) => {
      if (it.id !== itemId) return it
      if (!shift) return { id: it.id, entryId: it.entryId }
      return { id: it.id, entryId: it.entryId, keyShift: shift }
    })
    await setItems(id, items)
  }

  function isItemSung(id: string, itemId: string): boolean {
    const pl = byId(id)
    return !!pl?.sungItemIds?.includes(itemId)
  }

  return {
    playlists,
    sorted,
    loaded,
    loading,
    ensureLoaded,
    refresh,
    byId,
    createPlaylist,
    renamePlaylist,
    setOpenFullscreen,
    setShowPitchButtons,
    setCardLayout,
    deletePlaylist,
    setItems,
    addEntries,
    removeItem,
    reorderItem,
    markItemSung,
    clearSung,
    setItemKeyShift,
    isItemSung,
  }
})
