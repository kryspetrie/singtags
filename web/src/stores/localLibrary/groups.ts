/** My Library groups, merge, and reorder. */

import { lazyFn, type StoreDeps } from './deps'

import type { LocalAsset, LocalAssetRole, LocalEntry, LocalGroup } from '../../types/localLibrary'

import {
  deleteLocalEntry,
  deleteLocalGroup,
  getLocalEntry,
  newLocalId,
  putLocalAsset,
  putLocalEntry,
  putLocalGroup,
} from '../../offline/localLibraryDb'

export function createLocalGroupActions(deps: StoreDeps) {

  const activeGroupId = deps.activeGroupId
  const assetsByEntry = deps.assetsByEntry
  const assetsFor = lazyFn(() => deps.assetsFor)
  const bumpEntryInList = lazyFn(() => deps.bumpEntryInList)
  const entries = deps.entries
  const entryOrder = deps.entryOrder
  const groups = deps.groups
  const persistEntryOrder = lazyFn(() => deps.persistEntryOrder)
  const syncEntryIntoGroups = lazyFn(() => deps.syncEntryIntoGroups)
  const syncEntryOrder = lazyFn(() => deps.syncEntryOrder)
  const syncGroupEntryIds = lazyFn(() => deps.syncGroupEntryIds)

  async function createGroup(name: string): Promise<LocalGroup | null> {
    const trimmed = name.trim().replace(/\s+/g, ' ')
    if (!trimmed) return null
    if (groups.value.some((g: any) => g.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error('A group with that name already exists.')
    }
    const group: LocalGroup = {
      id: newLocalId('lg'),
      name: trimmed,
      createdAt: new Date().toISOString(),
      entryIds: [],
    }
    await putLocalGroup(group)
    groups.value = [...groups.value, group].sort((a, b) => a.name.localeCompare(b.name))
    return group
  }

  async function renameGroup(id: string, name: string): Promise<LocalGroup | null> {
    const trimmed = name.trim().replace(/\s+/g, ' ')
    if (!trimmed) return null
    const existing = groups.value.find((g: any) => g.id === id)
    if (!existing) return null
    if (
      groups.value.some(
        (g: any) => g.id !== id && g.name.toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      throw new Error('A group with that name already exists.')
    }
    const next = { ...existing, name: trimmed }
    await putLocalGroup(next)
    groups.value = groups.value
      .map((g: any) => (g.id === id ? next : g))
      .sort((a: any, b: any) => a.name.localeCompare(b.name))
    return next
  }

  async function addEntriesToGroup(groupId: string, entryIds: string[]): Promise<void> {
    const group = groups.value.find((g: any) => g.id === groupId)
    if (!group) throw new Error('Group not found.')
    const unique = [...new Set(entryIds)].filter((id) => entries.value.some((e: any) => e.id === id))
    if (!unique.length) return
    let nextIds = [...group.entryIds]
    for (const id of unique) {
      if (!nextIds.includes(id)) nextIds.push(id)
    }
    if (nextIds.join(',') !== group.entryIds.join(',')) {
      const patched = { ...group, entryIds: nextIds }
      await putLocalGroup(patched)
      groups.value = groups.value.map((g: any) => (g.id === groupId ? patched : g))
    }
    for (const id of unique) {
      const entry = entries.value.find((e: any) => e.id === id)
      if (!entry || entry.groupIds.includes(groupId)) continue
      const next: LocalEntry = {
        ...entry,
        groupIds: [...entry.groupIds, groupId],
        updatedAt: new Date().toISOString(),
      }
      await putLocalEntry(next)
      bumpEntryInList(next)
    }
  }

  async function removeEntriesFromGroup(groupId: string, entryIds: string[]): Promise<void> {
    const group = groups.value.find((g: any) => g.id === groupId)
    if (!group) return
    const drop = new Set(entryIds)
    const nextIds = group.entryIds.filter((id: any) => !drop.has(id))
    if (nextIds.length !== group.entryIds.length) {
      const patched = { ...group, entryIds: nextIds }
      await putLocalGroup(patched)
      groups.value = groups.value.map((g: any) => (g.id === groupId ? patched : g))
    }
    for (const id of drop) {
      const entry = entries.value.find((e: any) => e.id === id)
      if (!entry?.groupIds.includes(groupId)) continue
      const next: LocalEntry = {
        ...entry,
        groupIds: entry.groupIds.filter((g: any) => g !== groupId),
        updatedAt: new Date().toISOString(),
      }
      await putLocalEntry(next)
      bumpEntryInList(next)
    }
  }

  async function removeGroup(id: string): Promise<void> {
    await deleteLocalGroup(id)
    groups.value = groups.value.filter((g: any) => g.id !== id)
    entries.value = entries.value.map((e: any) =>
      e.groupIds.includes(id)
        ? { ...e, groupIds: e.groupIds.filter((g: any) => g !== id) }
        : e,
    )
    if (activeGroupId.value === id) activeGroupId.value = null
  }

  /**
   * Move all assets from `sourceIds` onto `targetId`, apply roles/labels/order,
   * then delete the source entries (blobs stay with moved assets).
   */
  async function mergeEntries(
    targetId: string,
    sourceIds: string[],
    opts: {
      assets: Array<{ id: string; role: LocalAssetRole; label: string }>
      title?: string
      appendNotes?: boolean
    },
  ): Promise<LocalEntry> {
    const target = entries.value.find((e: any) => e.id === targetId) ?? (await getLocalEntry(targetId))
    if (!target) throw new Error('Target song not found.')
    const sources = [
      ...new Set(sourceIds.filter((id) => id && id !== targetId)),
    ]
    if (!sources.length) throw new Error('Select at least one other song to merge.')
    for (const id of sources) {
      if (!entries.value.some((e: any) => e.id === id) && !(await getLocalEntry(id))) {
        throw new Error('A song to merge was not found.')
      }
    }

    const byId = new Map<string, LocalAsset>()
    for (const a of assetsFor(targetId)) byId.set(a.id, a)
    for (const sid of sources) {
      for (const a of assetsFor(sid)) byId.set(a.id, a)
    }
    if (!opts.assets.length) throw new Error('Nothing to merge.')
    for (const row of opts.assets) {
      if (!byId.has(row.id)) throw new Error('Merged asset list is out of date.')
    }

    const now = new Date().toISOString()
    const moved: LocalAsset[] = []
    for (let i = 0; i < opts.assets.length; i++) {
      const row = opts.assets[i]!
      const prev = byId.get(row.id)!
      const next: LocalAsset = {
        ...prev,
        entryId: targetId,
        role: row.role,
        label: row.label.trim() || prev.label,
        sortIndex: i,
        updatedAt: now,
      }
      await putLocalAsset(next)
      moved.push(next)
    }

    const groupUnion = new Set(target.groupIds)
    let notes = target.notes
    for (const sid of sources) {
      const src = entries.value.find((e: any) => e.id === sid)
      if (!src) continue
      for (const g of src.groupIds) groupUnion.add(g)
      if (opts.appendNotes && src.notes.trim()) {
        notes = notes.trim()
          ? `${notes.trim()}\n\n${src.notes.trim()}`
          : src.notes.trim()
      }
    }

    const nextEntry: LocalEntry = {
      ...target,
      title: (opts.title?.trim() || target.title).trim() || target.title,
      notes,
      groupIds: [...groupUnion],
      updatedAt: now,
    }
    await putLocalEntry(nextEntry)
    bumpEntryInList(nextEntry)
    await syncEntryIntoGroups(nextEntry)

    for (const sid of sources) {
      // Assets already re-pointed; deleteLocalEntry only removes leftovers + entry row.
      await deleteLocalEntry(sid)
      entries.value = entries.value.filter((e: any) => e.id !== sid)
      const nextAssets = { ...assetsByEntry.value }
      delete nextAssets[sid]
      assetsByEntry.value = nextAssets
    }
    await persistEntryOrder(entryOrder.value.filter((id: any) => !sources.includes(id)))
    const nextGroups: LocalGroup[] = []
    for (const g of groups.value) {
      const filtered = g.entryIds.filter((id: any) => !sources.includes(id))
      if (filtered.length === g.entryIds.length) {
        nextGroups.push(g)
        continue
      }
      const patched = { ...g, entryIds: filtered }
      await putLocalGroup(patched)
      nextGroups.push(patched)
    }
    groups.value = nextGroups
    assetsByEntry.value = { ...assetsByEntry.value, [targetId]: moved }
    return nextEntry
  }

  /** Drag-reorder within All or the active group (Favorites-style). */
  async function reorderEntry(entryId: string, toIndex: number): Promise<void> {
    const gid = activeGroupId.value
    if (gid) {
      const group = groups.value.find((g: any) => g.id === gid)
      if (!group) return
      const ids = syncGroupEntryIds(group)
      const from = ids.indexOf(entryId)
      if (from < 0) return
      const nextIds = [...ids]
      nextIds.splice(from, 1)
      const clamped = Math.max(0, Math.min(nextIds.length, toIndex))
      nextIds.splice(clamped, 0, entryId)
      const next = { ...group, entryIds: nextIds }
      await putLocalGroup(next)
      groups.value = groups.value.map((g: any) => (g.id === gid ? next : g))
      return
    }
    const ids = syncEntryOrder(entryOrder.value)
    const from = ids.indexOf(entryId)
    if (from < 0) return
    const nextIds = [...ids]
    nextIds.splice(from, 1)
    const clamped = Math.max(0, Math.min(nextIds.length, toIndex))
    nextIds.splice(clamped, 0, entryId)
    await persistEntryOrder(nextIds)
  }

  const actions = {
    createGroup,
    renameGroup,
    addEntriesToGroup,
    removeEntriesFromGroup,
    removeGroup,
    mergeEntries,
    reorderEntry,
  }
  Object.assign(deps, actions)

  function bindWatches(): void {}

  return { actions, bindWatches }

}
