/**
 * Pinia store for My Library entries + assets (parallel tag library).
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  LocalAsset,
  LocalEntry,
  LocalGroup,
} from '../types/localLibrary'
import {
  deleteLocalAsset,
  deleteLocalEntry,
  getLocalAssetBlob,
  getLocalEntry,
  getLocalLibraryPrefs,
  listAllLocalAssets,
  listAssetsForEntry,
  listLocalEntries,
  listLocalGroups,
  putLocalAsset,
  putLocalEntry,
  putLocalGroup,
  putLocalLibraryPrefs,
} from '../offline/localLibraryDb'
import { inferPartIdForAsset } from '../lib/localAssetHeuristics'
import { entryAssetSummary, orderEntriesByIds } from '../types/localLibrary'
import { type StoreDeps } from './localLibrary/deps'
import { createLocalImportActions } from './localLibrary/importEntries'
import { createLocalGroupActions } from './localLibrary/groups'

export const useLocalLibraryStore = defineStore('localLibrary', () => {

  const entries = ref<LocalEntry[]>([])
  const assetsByEntry = ref<Record<string, LocalAsset[]>>({})
  const groups = ref<LocalGroup[]>([])
  const entryOrder = ref<string[]>([])
  const loaded = ref(false)

  const loading = ref(false)
  const error = ref<string | null>(null)
  const activeGroupId = ref<string | null>(null)

  const filteredEntries = computed(() => {
    const gid = activeGroupId.value
    if (!gid) return orderEntriesByIds(entries.value, entryOrder.value)
    const group = groups.value.find((g) => g.id === gid)
    const members = entries.value.filter((e) => e.groupIds.includes(gid))
    return orderEntriesByIds(members, group?.entryIds ?? [])
  })
  const deps: StoreDeps = {
    entries,
    assetsByEntry,
    groups,
    entryOrder,
    loaded,
    loading,
    error,
    activeGroupId,
    filteredEntries,
    withInferredPartId,
    assetsFor,
    summaryFor,
    syncEntryOrder,
    syncGroupEntryIds,
    persistEntryOrder,
    ensureLoaded,
    maybeWarnStorageQuota,
    refresh,
    reloadAssets,
    bumpEntryInList,
    syncEntryIntoGroups,
    trackNewEntry,
    updateMeta,
    updateAssetMeta,
    removeAsset,
    removeEntry,
    entryPayloadBytes,
    findSoftDuplicate,
  }
  const importActions = createLocalImportActions(deps)
  const groupActions = createLocalGroupActions(deps)
  importActions.bindWatches()
  groupActions.bindWatches()
  const {
    importFilesSeparate,
    importFilesCombined,
    importFromBytes,
    importEntryBundle,
    createEmptyEntry,
    addFilesToEntry,
    replaceEntryFromBundle,
    createGroup,
    renameGroup,
    addEntriesToGroup,
    removeEntriesFromGroup,
    removeGroup,
    mergeEntries,
    reorderEntry,
  } = {
    ...importActions.actions,
    ...groupActions.actions,
  }

  function withInferredPartId(asset: LocalAsset): LocalAsset {
    if (asset.role !== 'track') return { ...asset, partId: asset.partId ?? null }
    if (asset.partId) return asset
    const inferred = inferPartIdForAsset(asset)
    return { ...asset, partId: inferred }
  }

  function assetsFor(entryId: string): LocalAsset[] {
    return assetsByEntry.value[entryId] ?? []
  }

  function summaryFor(entryId: string): string {
    return entryAssetSummary(assetsFor(entryId))
  }

  function syncEntryOrder(ids: string[]): string[] {
    const known = new Set(entries.value.map((e) => e.id))
    const next = ids.filter((id) => known.has(id))
    for (const e of entries.value) {
      if (!next.includes(e.id)) next.push(e.id)
    }
    return next
  }

  function syncGroupEntryIds(group: LocalGroup): string[] {
    const members = new Set(
      entries.value.filter((e) => e.groupIds.includes(group.id)).map((e) => e.id),
    )
    const next = group.entryIds.filter((id) => members.has(id))
    for (const id of members) {
      if (!next.includes(id)) next.push(id)
    }
    return next
  }

  async function persistEntryOrder(next: string[]): Promise<void> {
    entryOrder.value = next
    await putLocalLibraryPrefs({ id: 'prefs', entryOrder: next })
  }

  async function ensureLoaded(): Promise<void> {
    if (loaded.value || loading.value) return
    loading.value = true
    error.value = null
    try {
      const [e, a, g, prefs] = await Promise.all([
        listLocalEntries(),
        listAllLocalAssets(),
        listLocalGroups(),
        getLocalLibraryPrefs(),
      ])
      entries.value = e
      const map: Record<string, LocalAsset[]> = {}
      const toPersist: LocalAsset[] = []
      for (const asset of a) {
        const next = withInferredPartId(asset)
        if (asset.role === 'track' && !asset.partId && next.partId) toPersist.push(next)
        ;(map[asset.entryId] ??= []).push(next)
      }
      for (const asset of toPersist) {
        void putLocalAsset(asset)
      }
      for (const id of Object.keys(map)) {
        map[id]!.sort((x, y) => x.sortIndex - y.sortIndex || x.createdAt.localeCompare(y.createdAt))
      }
      assetsByEntry.value = map
      // Backfill empty group.entryIds from membership.
      const patchedGroups = g.map((group) => {
        if (group.entryIds.length) return group
        return {
          ...group,
          entryIds: e
            .filter((x) => x.groupIds.includes(group.id))
            .map((x) => x.id),
        }
      })
      groups.value = patchedGroups
      for (const group of patchedGroups) {
        if (!g.find((x) => x.id === group.id)?.entryIds.length && group.entryIds.length) {
          void putLocalGroup(group)
        }
      }
      entryOrder.value = syncEntryOrder(prefs.entryOrder)
      if (entryOrder.value.join(',') !== prefs.entryOrder.join(',')) {
        await putLocalLibraryPrefs({ id: 'prefs', entryOrder: entryOrder.value })
      }
      loaded.value = true
      void maybeWarnStorageQuota()
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  async function maybeWarnStorageQuota(): Promise<void> {
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('ll-quota-warned')) return
      const { getStorageEstimate } = await import('../offline/storageEstimate')
      const est = await getStorageEstimate()
      if (est && est.quota > 0 && est.usageRatio >= 0.8) {
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('ll-quota-warned', '1')
        const { useSnackbarStore } = await import('./snackbar')
        useSnackbarStore().show(
          'This device is low on storage space. Large My Library imports may fail.',
          { tone: 'info', ms: 6000 },
        )
      }
    } catch {
      /* ignore */
    }
  }

  async function refresh(): Promise<void> {
    loaded.value = false
    await ensureLoaded()
  }

  async function reloadAssets(entryId: string): Promise<LocalAsset[]> {
    const list = (await listAssetsForEntry(entryId)).map(withInferredPartId)
    assetsByEntry.value = { ...assetsByEntry.value, [entryId]: list }
    return list
  }

  function bumpEntryInList(entry: LocalEntry): void {
    const i = entries.value.findIndex((e) => e.id === entry.id)
    if (i < 0) {
      entries.value = [...entries.value, entry]
      return
    }
    const next = entries.value.slice()
    next[i] = entry
    entries.value = next
  }

  async function syncEntryIntoGroups(entry: LocalEntry): Promise<void> {
    const want = new Set(entry.groupIds)
    const nextGroups: LocalGroup[] = []
    for (const g of groups.value) {
      const has = g.entryIds.includes(entry.id)
      const should = want.has(g.id)
      if (should && !has) {
        const patched = { ...g, entryIds: [...g.entryIds, entry.id] }
        await putLocalGroup(patched)
        nextGroups.push(patched)
      } else if (!should && has) {
        const patched = { ...g, entryIds: g.entryIds.filter((x) => x !== entry.id) }
        await putLocalGroup(patched)
        nextGroups.push(patched)
      } else {
        nextGroups.push(g)
      }
    }
    groups.value = nextGroups
  }

  async function trackNewEntry(entry: LocalEntry): Promise<void> {
    bumpEntryInList(entry)
    const nextOrder = [entry.id, ...entryOrder.value.filter((id) => id !== entry.id)]
    await persistEntryOrder(nextOrder)
    if (entry.groupIds.length) await syncEntryIntoGroups(entry)
  }

  async function updateMeta(
    id: string,
    patch: Partial<Pick<LocalEntry, 'title' | 'arranger' | 'notes' | 'lyricsHint' | 'key' | 'detuneCents' | 'groupIds'>>,
  ): Promise<LocalEntry | null> {
    const existing = entries.value.find((e) => e.id === id) ?? (await getLocalEntry(id))
    if (!existing) return null
    const next: LocalEntry = {
      ...existing,
      ...patch,
      title: (patch.title ?? existing.title).trim() || existing.title,
      arranger: (patch.arranger ?? existing.arranger).trim(),
      notes: (patch.notes ?? existing.notes).trim(),
      lyricsHint: (patch.lyricsHint ?? existing.lyricsHint ?? '').trim(),
      key: patch.key !== undefined ? patch.key?.trim() || null : existing.key,
      detuneCents:
        patch.detuneCents !== undefined && Number.isFinite(patch.detuneCents)
          ? Math.max(-50, Math.min(50, Math.round(patch.detuneCents)))
          : existing.detuneCents,
      updatedAt: new Date().toISOString(),
    }
    await putLocalEntry(next)
    bumpEntryInList(next)
    if (patch.groupIds) await syncEntryIntoGroups(next)
    return next
  }

  async function updateAssetMeta(
    assetId: string,
    patch: Partial<Pick<LocalAsset, 'role' | 'label' | 'partId' | 'sortIndex'>>,
  ): Promise<LocalAsset | null> {
    const all = Object.values(assetsByEntry.value).flat()
    const existing = all.find((a) => a.id === assetId)
    if (!existing) return null
    const next: LocalAsset = {
      ...existing,
      ...patch,
      label: (patch.label ?? existing.label).trim() || existing.label,
      updatedAt: new Date().toISOString(),
    }
    await putLocalAsset(next)
    await reloadAssets(existing.entryId)
    return next
  }

  async function removeAsset(assetId: string): Promise<void> {
    const all = Object.values(assetsByEntry.value).flat()
    const existing = all.find((a) => a.id === assetId)
    if (!existing) return
    await deleteLocalAsset(assetId)
    await reloadAssets(existing.entryId)
  }

  async function removeEntry(id: string): Promise<void> {
    await deleteLocalEntry(id)
    entries.value = entries.value.filter((e) => e.id !== id)
    const nextAssets = { ...assetsByEntry.value }
    delete nextAssets[id]
    assetsByEntry.value = nextAssets
    await persistEntryOrder(entryOrder.value.filter((x) => x !== id))
    const nextGroups: LocalGroup[] = []
    for (const g of groups.value) {
      if (!g.entryIds.includes(id)) {
        nextGroups.push(g)
        continue
      }
      const patched = { ...g, entryIds: g.entryIds.filter((x) => x !== id) }
      await putLocalGroup(patched)
      nextGroups.push(patched)
    }
    groups.value = nextGroups
  }

  function entryPayloadBytes(entryId: string): number {
    return assetsFor(entryId).reduce((sum, a) => sum + a.byteLength, 0)
  }

  /** Soft match for receive dedupe: same title (ci) + same total asset bytes. */
  function findSoftDuplicate(title: string, byteTotal: number): LocalEntry | null {
    const t = title.trim().toLowerCase()
    if (!t) return null
    return (
      entries.value.find(
        (e) => e.title.trim().toLowerCase() === t && entryPayloadBytes(e.id) === byteTotal,
      ) ?? null
    )
  }

  return {
    entries,
    assetsByEntry,
    groups,
    entryOrder,
    loaded,
    loading,
    error,
    activeGroupId,
    filteredEntries,
    assetsFor,
    summaryFor,
    ensureLoaded,
    refresh,
    reloadAssets,
    importFilesSeparate,
    importFilesCombined,
    importFromBytes,
    importEntryBundle,
    createEmptyEntry,
    updateMeta,
    updateAssetMeta,
    addFilesToEntry,
    removeAsset,
    removeEntry,
    entryPayloadBytes,
    findSoftDuplicate,
    replaceEntryFromBundle,
    createGroup,
    renameGroup,
    addEntriesToGroup,
    removeEntriesFromGroup,
    removeGroup,
    mergeEntries,
    reorderEntry,
    getLocalAssetBlob,
    getLocalEntry,
  }
})
