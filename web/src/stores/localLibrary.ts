/**
 * Pinia store for Local Library entries + assets (parallel tag library).
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { LocalAsset, LocalAssetRole, LocalEntry, LocalGroup } from '../types/localLibrary'
import {
  deleteLocalAsset,
  deleteLocalEntry,
  deleteLocalGroup,
  getLocalAssetBlob,
  getLocalEntry,
  getLocalLibraryPrefs,
  listAllLocalAssets,
  listAssetsForEntry,
  listLocalEntries,
  listLocalGroups,
  newLocalId,
  putLocalAsset,
  putLocalEntry,
  putLocalEntryBundle,
  putLocalGroup,
  putLocalLibraryPrefs,
} from '../offline/localLibraryDb'
import {
  defaultTrackLabel,
  guessPartIdFromFilename,
  inferPartIdForAsset,
} from '../lib/localAssetHeuristics'
import {
  entryAssetSummary,
  guessAssetRoles,
  guessLocalMime,
  isLocalLibraryMime,
  orderEntriesByIds,
  titleFromFilename,
} from '../types/localLibrary'

export const useLocalLibraryStore = defineStore('localLibrary', () => {
  const entries = ref<LocalEntry[]>([])
  const assetsByEntry = ref<Record<string, LocalAsset[]>>({})
  const groups = ref<LocalGroup[]>([])
  const entryOrder = ref<string[]>([])
  const loaded = ref(false)

  function withInferredPartId(asset: LocalAsset): LocalAsset {
    if (asset.role !== 'track') return { ...asset, partId: asset.partId ?? null }
    if (asset.partId) return asset
    const inferred = inferPartIdForAsset(asset)
    return { ...asset, partId: inferred }
  }

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
          'This device is low on storage space. Large Local Library imports may fail.',
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

  /** N files → N entries (1 asset each). */
  async function importFilesSeparate(
    files: File[],
    opts?: { groupId?: string },
  ): Promise<LocalEntry[]> {
    const created: LocalEntry[] = []
    const roles = guessAssetRoles(files.map((f) => ({ mime: guessLocalMime(f), filename: f.name })))
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!
      const role = roles[i] ?? 'other'
      const entry = await importOneFileAsEntry(file, { role, groupId: opts?.groupId })
      created.push(entry)
    }
    return created
  }

  /** N files → 1 entry with N assets. */
  async function importFilesCombined(
    files: File[],
    opts?: {
      groupId?: string
      title?: string
      roles?: LocalAssetRole[]
      labels?: string[]
      partIds?: Array<string | null | undefined>
    },
  ): Promise<LocalEntry> {
    if (!files.length) throw new Error('No files to import.')
    const mimeChecks = files.map((f) => ({ mime: guessLocalMime(f), filename: f.name }))
    for (const c of mimeChecks) {
      if (!isLocalLibraryMime(c.mime, c.filename)) {
        throw new Error(`Unsupported file type: ${c.filename}`)
      }
    }
    const roles = opts?.roles ?? guessAssetRoles(mimeChecks)
    const now = new Date().toISOString()
    const entryId = newLocalId('le')
    const title =
      (opts?.title?.trim() || titleFromFilename(files[0]!.name)).trim() || 'Untitled'
    const entry: LocalEntry = {
      id: entryId,
      title,
      arranger: '',
      notes: '',
      lyricsHint: '',
      key: null,
      detuneCents: 0,
      createdAt: now,
      updatedAt: now,
      groupIds: opts?.groupId ? [opts.groupId] : [],
    }
    const assets: LocalAsset[] = []
    const blobs: { id: string; mime: string; data: ArrayBuffer }[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!
      const mime = mimeChecks[i]!.mime
      const buf = await file.arrayBuffer()
      const assetId = newLocalId('la')
      const role = roles[i] ?? 'other'
      const partId =
        opts?.partIds?.[i] ??
        (role === 'track' ? guessPartIdFromFilename(file.name) : null)
      const label =
        (opts?.labels?.[i]?.trim() ||
          (role === 'track' ? defaultTrackLabel(file.name, partId) : titleFromFilename(file.name))
        ).trim() || file.name
      assets.push({
        id: assetId,
        entryId,
        role,
        label,
        partId: role === 'track' ? partId : null,
        mime,
        filename: file.name,
        byteLength: buf.byteLength,
        sortIndex: i,
        createdAt: now,
        updatedAt: now,
      })
      blobs.push({ id: assetId, mime, data: buf })
    }
    await putLocalEntryBundle(entry, assets, blobs)
    await trackNewEntry(entry)
    assetsByEntry.value = { ...assetsByEntry.value, [entryId]: assets }
    return entry
  }

  async function importOneFileAsEntry(
    file: File,
    opts?: { role?: LocalAssetRole; groupId?: string; title?: string },
  ): Promise<LocalEntry> {
    const mime = guessLocalMime(file)
    if (!isLocalLibraryMime(mime, file.name)) {
      throw new Error('Local Library accepts PDF, image, and audio files only.')
    }
    const buf = await file.arrayBuffer()
    const now = new Date().toISOString()
    const entryId = newLocalId('le')
    const assetId = newLocalId('la')
    const role =
      opts?.role ??
      guessAssetRoles([{ mime, filename: file.name }])[0] ??
      'other'
    const entry: LocalEntry = {
      id: entryId,
      title: (opts?.title?.trim() || titleFromFilename(file.name)).trim() || 'Untitled',
      arranger: '',
      notes: '',
      lyricsHint: '',
      key: null,
      detuneCents: 0,
      createdAt: now,
      updatedAt: now,
      groupIds: opts?.groupId ? [opts.groupId] : [],
    }
    const partId = role === 'track' ? guessPartIdFromFilename(file.name) : null
    const asset: LocalAsset = {
      id: assetId,
      entryId,
      role,
      label:
        role === 'track'
          ? defaultTrackLabel(file.name, partId)
          : titleFromFilename(file.name) || file.name,
      partId,
      mime,
      filename: file.name,
      byteLength: buf.byteLength,
      sortIndex: 0,
      createdAt: now,
      updatedAt: now,
    }
    await putLocalEntryBundle(entry, [asset], [{ id: assetId, mime, data: buf }])
    await trackNewEntry(entry)
    assetsByEntry.value = { ...assetsByEntry.value, [entryId]: [asset] }
    return entry
  }

  /** Receive path: single-file legacy or build entry from bytes. */
  async function importFromBytes(opts: {
    filename: string
    mime: string
    data: ArrayBuffer
    title?: string
    arranger?: string
    notes?: string
    lyricsHint?: string
    key?: string | null
    detuneCents?: number
    role?: LocalAssetRole
    partId?: string | null
  }): Promise<LocalEntry> {
    if (!isLocalLibraryMime(opts.mime, opts.filename)) {
      throw new Error('Local Library accepts PDF, image, and audio files only.')
    }
    const now = new Date().toISOString()
    const entryId = newLocalId('le')
    const assetId = newLocalId('la')
    const role =
      opts.role ??
      guessAssetRoles([{ mime: opts.mime, filename: opts.filename }])[0] ??
      'other'
    const entry: LocalEntry = {
      id: entryId,
      title: (opts.title?.trim() || titleFromFilename(opts.filename)).trim() || 'Untitled',
      arranger: opts.arranger?.trim() ?? '',
      notes: opts.notes?.trim() ?? '',
      lyricsHint: opts.lyricsHint?.trim() ?? '',
      key: opts.key?.trim() || null,
      detuneCents:
        opts.detuneCents != null && Number.isFinite(opts.detuneCents)
          ? Math.max(-50, Math.min(50, Math.round(opts.detuneCents)))
          : 0,
      createdAt: now,
      updatedAt: now,
      groupIds: [],
    }
    const partId =
      opts.partId ?? (role === 'track' ? guessPartIdFromFilename(opts.filename) : null)
    const asset: LocalAsset = {
      id: assetId,
      entryId,
      role,
      label:
        role === 'track'
          ? defaultTrackLabel(opts.filename, partId)
          : titleFromFilename(opts.filename) || opts.filename,
      partId,
      mime: opts.mime,
      filename: opts.filename,
      byteLength: opts.data.byteLength,
      sortIndex: 0,
      createdAt: now,
      updatedAt: now,
    }
    await putLocalEntryBundle(entry, [asset], [{ id: assetId, mime: opts.mime, data: opts.data }])
    await trackNewEntry(entry)
    assetsByEntry.value = { ...assetsByEntry.value, [entryId]: [asset] }
    return entry
  }

  async function importEntryBundle(opts: {
    entry: Omit<LocalEntry, 'id' | 'createdAt' | 'updatedAt' | 'groupIds'> & {
      groupIds?: string[]
    }
    assets: Array<{
      role: LocalAssetRole
      label: string
      partId?: string | null
      mime: string
      filename: string
      data: ArrayBuffer
      sortIndex?: number
    }>
  }): Promise<LocalEntry> {
    const now = new Date().toISOString()
    const entryId = newLocalId('le')
    const entry: LocalEntry = {
      id: entryId,
      title: opts.entry.title.trim() || 'Untitled',
      arranger: opts.entry.arranger.trim(),
      notes: opts.entry.notes.trim(),
      lyricsHint: (opts.entry.lyricsHint ?? '').trim(),
      key: opts.entry.key?.trim() || null,
      detuneCents: opts.entry.detuneCents ?? 0,
      createdAt: now,
      updatedAt: now,
      groupIds: opts.entry.groupIds ?? [],
    }
    const assets: LocalAsset[] = []
    const blobs: { id: string; mime: string; data: ArrayBuffer }[] = []
    opts.assets.forEach((a, i) => {
      const assetId = newLocalId('la')
      const partId =
        a.partId ??
        (a.role === 'track' ? guessPartIdFromFilename(a.filename) : null)
      assets.push({
        id: assetId,
        entryId,
        role: a.role,
        label: a.label.trim() || titleFromFilename(a.filename),
        partId: a.role === 'track' ? partId : null,
        mime: a.mime,
        filename: a.filename,
        byteLength: a.data.byteLength,
        sortIndex: a.sortIndex ?? i,
        createdAt: now,
        updatedAt: now,
      })
      blobs.push({ id: assetId, mime: a.mime, data: a.data })
    })
    await putLocalEntryBundle(entry, assets, blobs)
    await trackNewEntry(entry)
    assetsByEntry.value = { ...assetsByEntry.value, [entryId]: assets }
    return entry
  }

  /**
   * Metadata-only song (no sheet/audio). Useful for set lists that still need
   * title, key/pitch, and lyric cues without imported media.
   */
  async function createEmptyEntry(opts?: {
    title?: string
    arranger?: string
    notes?: string
    lyricsHint?: string
    key?: string | null
    detuneCents?: number
    groupId?: string
  }): Promise<LocalEntry> {
    const now = new Date().toISOString()
    const entry: LocalEntry = {
      id: newLocalId('le'),
      title: (opts?.title?.trim() || 'Untitled').trim() || 'Untitled',
      arranger: opts?.arranger?.trim() ?? '',
      notes: opts?.notes?.trim() ?? '',
      lyricsHint: opts?.lyricsHint?.trim() ?? '',
      key: opts?.key?.trim() || null,
      detuneCents:
        opts?.detuneCents != null && Number.isFinite(opts.detuneCents)
          ? Math.max(-50, Math.min(50, Math.round(opts.detuneCents)))
          : 0,
      createdAt: now,
      updatedAt: now,
      groupIds: opts?.groupId ? [opts.groupId] : [],
    }
    await putLocalEntry(entry)
    await trackNewEntry(entry)
    assetsByEntry.value = { ...assetsByEntry.value, [entry.id]: [] }
    return entry
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

  async function addFilesToEntry(
    entryId: string,
    files: File[],
    roles?: LocalAssetRole[],
  ): Promise<LocalAsset[]> {
    const entry = entries.value.find((e) => e.id === entryId) ?? (await getLocalEntry(entryId))
    if (!entry) throw new Error('Entry not found.')
    const existing = await reloadAssets(entryId)
    const guessed = guessAssetRoles([
      ...existing.map((a) => ({ mime: a.mime, filename: a.filename })),
      ...files.map((f) => ({ mime: guessLocalMime(f), filename: f.name })),
    ]).slice(existing.length)
    const now = new Date().toISOString()
    const added: LocalAsset[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!
      const mime = guessLocalMime(file)
      if (!isLocalLibraryMime(mime, file.name)) {
        throw new Error(`Unsupported file type: ${file.name}`)
      }
      const buf = await file.arrayBuffer()
      const assetId = newLocalId('la')
      const role = roles?.[i] ?? guessed[i] ?? 'other'
      const partId = role === 'track' ? guessPartIdFromFilename(file.name) : null
      const asset: LocalAsset = {
        id: assetId,
        entryId,
        role,
        label:
          role === 'track'
            ? defaultTrackLabel(file.name, partId)
            : titleFromFilename(file.name) || file.name,
        partId,
        mime,
        filename: file.name,
        byteLength: buf.byteLength,
        sortIndex: existing.length + i,
        createdAt: now,
        updatedAt: now,
      }
      await putLocalAsset(asset, { id: assetId, mime, data: buf })
      added.push(asset)
    }
    await putLocalEntry({ ...entry, updatedAt: now })
    bumpEntryInList({ ...entry, updatedAt: now })
    await reloadAssets(entryId)
    return added
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

  /** Replace assets + meta in place (keeps id, groupIds, list order). */
  async function replaceEntryFromBundle(
    entryId: string,
    opts: {
      entry: Omit<LocalEntry, 'id' | 'createdAt' | 'updatedAt' | 'groupIds'> & {
        groupIds?: string[]
      }
      assets: Array<{
        role: LocalAssetRole
        label: string
        mime: string
        filename: string
        data: ArrayBuffer
        sortIndex?: number
      }>
    },
  ): Promise<LocalEntry> {
    const existing = entries.value.find((e) => e.id === entryId) ?? (await getLocalEntry(entryId))
    if (!existing) throw new Error('Entry not found.')
    const oldAssets = [...assetsFor(entryId)]
    for (const a of oldAssets) await deleteLocalAsset(a.id)

    const now = new Date().toISOString()
    const assets: LocalAsset[] = []
    const blobs: { id: string; mime: string; data: ArrayBuffer }[] = []
    opts.assets.forEach((a, i) => {
      const assetId = newLocalId('la')
      assets.push({
        id: assetId,
        entryId,
        role: a.role,
        label: a.label.trim() || titleFromFilename(a.filename),
        mime: a.mime,
        filename: a.filename,
        byteLength: a.data.byteLength,
        sortIndex: a.sortIndex ?? i,
        createdAt: now,
        updatedAt: now,
      })
      blobs.push({ id: assetId, mime: a.mime, data: a.data })
    })
    const next: LocalEntry = {
      id: entryId,
      title: opts.entry.title.trim() || existing.title,
      arranger: opts.entry.arranger.trim(),
      notes: opts.entry.notes.trim(),
      lyricsHint: (opts.entry.lyricsHint ?? '').trim(),
      key: opts.entry.key?.trim() || null,
      detuneCents: opts.entry.detuneCents ?? existing.detuneCents,
      createdAt: existing.createdAt,
      updatedAt: now,
      groupIds: existing.groupIds,
    }
    await putLocalEntryBundle(next, assets, blobs)
    bumpEntryInList(next)
    assetsByEntry.value = { ...assetsByEntry.value, [entryId]: assets }
    return next
  }

  async function createGroup(name: string): Promise<LocalGroup | null> {
    const trimmed = name.trim().replace(/\s+/g, ' ')
    if (!trimmed) return null
    if (groups.value.some((g) => g.name.toLowerCase() === trimmed.toLowerCase())) {
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
    const existing = groups.value.find((g) => g.id === id)
    if (!existing) return null
    if (
      groups.value.some(
        (g) => g.id !== id && g.name.toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      throw new Error('A group with that name already exists.')
    }
    const next = { ...existing, name: trimmed }
    await putLocalGroup(next)
    groups.value = groups.value
      .map((g) => (g.id === id ? next : g))
      .sort((a, b) => a.name.localeCompare(b.name))
    return next
  }

  async function addEntriesToGroup(groupId: string, entryIds: string[]): Promise<void> {
    const group = groups.value.find((g) => g.id === groupId)
    if (!group) throw new Error('Group not found.')
    const unique = [...new Set(entryIds)].filter((id) => entries.value.some((e) => e.id === id))
    if (!unique.length) return
    let nextIds = [...group.entryIds]
    for (const id of unique) {
      if (!nextIds.includes(id)) nextIds.push(id)
    }
    if (nextIds.join(',') !== group.entryIds.join(',')) {
      const patched = { ...group, entryIds: nextIds }
      await putLocalGroup(patched)
      groups.value = groups.value.map((g) => (g.id === groupId ? patched : g))
    }
    for (const id of unique) {
      const entry = entries.value.find((e) => e.id === id)
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
    const group = groups.value.find((g) => g.id === groupId)
    if (!group) return
    const drop = new Set(entryIds)
    const nextIds = group.entryIds.filter((id) => !drop.has(id))
    if (nextIds.length !== group.entryIds.length) {
      const patched = { ...group, entryIds: nextIds }
      await putLocalGroup(patched)
      groups.value = groups.value.map((g) => (g.id === groupId ? patched : g))
    }
    for (const id of drop) {
      const entry = entries.value.find((e) => e.id === id)
      if (!entry?.groupIds.includes(groupId)) continue
      const next: LocalEntry = {
        ...entry,
        groupIds: entry.groupIds.filter((g) => g !== groupId),
        updatedAt: new Date().toISOString(),
      }
      await putLocalEntry(next)
      bumpEntryInList(next)
    }
  }

  async function removeGroup(id: string): Promise<void> {
    await deleteLocalGroup(id)
    groups.value = groups.value.filter((g) => g.id !== id)
    entries.value = entries.value.map((e) =>
      e.groupIds.includes(id)
        ? { ...e, groupIds: e.groupIds.filter((g) => g !== id) }
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
    const target = entries.value.find((e) => e.id === targetId) ?? (await getLocalEntry(targetId))
    if (!target) throw new Error('Target song not found.')
    const sources = [
      ...new Set(sourceIds.filter((id) => id && id !== targetId)),
    ]
    if (!sources.length) throw new Error('Select at least one other song to merge.')
    for (const id of sources) {
      if (!entries.value.some((e) => e.id === id) && !(await getLocalEntry(id))) {
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
      const src = entries.value.find((e) => e.id === sid)
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
      entries.value = entries.value.filter((e) => e.id !== sid)
      const nextAssets = { ...assetsByEntry.value }
      delete nextAssets[sid]
      assetsByEntry.value = nextAssets
    }
    await persistEntryOrder(entryOrder.value.filter((id) => !sources.includes(id)))
    const nextGroups: LocalGroup[] = []
    for (const g of groups.value) {
      const filtered = g.entryIds.filter((id) => !sources.includes(id))
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
      const group = groups.value.find((g) => g.id === gid)
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
      groups.value = groups.value.map((g) => (g.id === gid ? next : g))
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
