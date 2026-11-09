/** Import files and byte bundles into My Library. */

import { lazyFn, type StoreDeps } from './deps'

import type {
  LocalAsset,
  LocalAssetRole,
  LocalEntry,
} from '../../types/localLibrary'

import {
  deleteLocalAsset,
  getLocalEntry,
  newLocalId,
  putLocalAsset,
  putLocalEntry,
  putLocalEntryBundle,
} from '../../offline/localLibraryDb'

import { defaultTrackLabel, guessPartIdFromFilename } from '../../lib/localAssetHeuristics'

import {
  guessAssetRoles,
  guessLocalMime,
  isLocalLibraryMime,
  titleFromFilename,
} from '../../types/localLibrary'

export function createLocalImportActions(deps: StoreDeps) {

  const assetsByEntry = deps.assetsByEntry
  const assetsFor = lazyFn(() => deps.assetsFor)
  const bumpEntryInList = lazyFn(() => deps.bumpEntryInList)
  const entries = deps.entries
  const reloadAssets = lazyFn(() => deps.reloadAssets)
  const trackNewEntry = lazyFn(() => deps.trackNewEntry)

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
      throw new Error('My Library accepts PDF, image, and audio files only.')
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
      throw new Error('My Library accepts PDF, image, and audio files only.')
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

  async function addFilesToEntry(
    entryId: string,
    files: File[],
    roles?: LocalAssetRole[],
  ): Promise<LocalAsset[]> {
    const entry = entries.value.find((e: any) => e.id === entryId) ?? (await getLocalEntry(entryId))
    if (!entry) throw new Error('Entry not found.')
    const existing = await reloadAssets(entryId)
    const guessed = guessAssetRoles([
      ...existing.map((a: any) => ({ mime: a.mime, filename: a.filename })),
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
    const existing = entries.value.find((e: any) => e.id === entryId) ?? (await getLocalEntry(entryId))
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

  const actions = {
    importFilesSeparate,
    importFilesCombined,
    importOneFileAsEntry,
    importFromBytes,
    importEntryBundle,
    createEmptyEntry,
    addFilesToEntry,
    replaceEntryFromBundle,
  }
  Object.assign(deps, actions)

  function bindWatches(): void {}

  return { actions, bindWatches }

}
