/**
 * Shared My Library optical-receive helpers (import, soft-dupe, post-import UX).
 */
import type { Router } from 'vue-router'
import type { OpticalFile } from '../../vendor/decimen/shared/protocol'
import {
  entryAssetsFromTransfer,
  isLocalEntryTransferFile,
  unpackLocalDocFile,
  unpackLocalEntryFile,
} from './decimen/localDocTransfer'
import { useLocalLibraryStore } from '../stores/localLibrary'
import { useLocalReceiveUiStore } from '../stores/localReceiveUi'
import { useSnackbarStore } from '../stores/snackbar'
import type { LocalEntry } from '../types/localLibrary'

/** Soft-warn when a single file exceeds this (optical / IDB honesty). */
export const LOCAL_FILE_WARN_BYTES = 12 * 1024 * 1024
/** Soft-warn when an entry’s assets exceed this total. */
export const LOCAL_ENTRY_WARN_BYTES = 20 * 1024 * 1024

export type LocalReceiveBundle =
  | {
      kind: 'entry'
      title: string
      arranger: string
      notes: string
      key: string | null
      detuneCents: number
      openNow: boolean
      assets: Array<{
        role: import('../types/localLibrary').LocalAssetRole
        label: string
        mime: string
        filename: string
        data: ArrayBuffer
        sortIndex: number
      }>
      byteTotal: number
    }
  | {
      kind: 'doc'
      title: string
      arranger: string
      notes: string
      key: string | null
      detuneCents: number
      openNow: boolean
      filename: string
      mime: string
      data: ArrayBuffer
      byteTotal: number
    }

export function parseLocalReceiveFile(file: OpticalFile): LocalReceiveBundle {
  if (isLocalEntryTransferFile(file)) {
    const pkg = unpackLocalEntryFile(file)
    const assets = entryAssetsFromTransfer(pkg.meta).map((a) => ({
      ...a,
      data: a.data instanceof ArrayBuffer ? a.data : (a.data as ArrayBuffer),
    }))
    return {
      kind: 'entry',
      title: pkg.meta.title,
      arranger: pkg.meta.arranger,
      notes: pkg.meta.notes,
      key: pkg.meta.key,
      detuneCents: pkg.meta.detuneCents,
      openNow: !!pkg.meta.openNow,
      assets,
      byteTotal: assets.reduce((s, a) => s + a.data.byteLength, 0),
    }
  }
  const pkg = unpackLocalDocFile(file)
  const data = pkg.bytes.buffer.slice(
    pkg.bytes.byteOffset,
    pkg.bytes.byteOffset + pkg.bytes.byteLength,
  ) as ArrayBuffer
  return {
    kind: 'doc',
    title: pkg.meta.title,
    arranger: pkg.meta.arranger,
    notes: pkg.meta.notes,
    key: pkg.meta.key,
    detuneCents: pkg.meta.detuneCents,
    openNow: !!pkg.meta.openNow,
    filename: pkg.meta.filename,
    mime: pkg.meta.mime,
    data,
    byteTotal: data.byteLength,
  }
}

export async function importLocalReceiveBundle(
  bundle: LocalReceiveBundle,
): Promise<LocalEntry> {
  const library = useLocalLibraryStore()
  if (bundle.kind === 'entry') {
    return library.importEntryBundle({
      entry: {
        title: bundle.title,
        arranger: bundle.arranger,
        notes: bundle.notes,
        lyricsHint: '',
        key: bundle.key,
        detuneCents: bundle.detuneCents,
      },
      assets: bundle.assets,
    })
  }
  return library.importFromBytes({
    filename: bundle.filename,
    mime: bundle.mime,
    data: bundle.data,
    title: bundle.title,
    arranger: bundle.arranger,
    notes: bundle.notes,
    key: bundle.key,
    detuneCents: bundle.detuneCents,
  })
}

export async function replaceLocalReceiveBundle(
  entryId: string,
  bundle: LocalReceiveBundle,
): Promise<LocalEntry> {
  const library = useLocalLibraryStore()
  if (bundle.kind === 'entry') {
    return library.replaceEntryFromBundle(entryId, {
      entry: {
        title: bundle.title,
        arranger: bundle.arranger,
        notes: bundle.notes,
        lyricsHint: '',
        key: bundle.key,
        detuneCents: bundle.detuneCents,
      },
      assets: bundle.assets,
    })
  }
  return library.replaceEntryFromBundle(entryId, {
    entry: {
      title: bundle.title,
      arranger: bundle.arranger,
      notes: bundle.notes,
      lyricsHint: '',
      key: bundle.key,
      detuneCents: bundle.detuneCents,
    },
    assets: [
      {
        role: 'sheet',
        label: bundle.title,
        mime: bundle.mime,
        filename: bundle.filename,
        data: bundle.data,
        sortIndex: 0,
      },
    ],
  })
}

export function formatLocalSizeWarn(bytes: number): string | null {
  if (bytes < LOCAL_FILE_WARN_BYTES) return null
  const mb = (bytes / (1024 * 1024)).toFixed(bytes >= 20 * 1024 * 1024 ? 0 : 1)
  return `About ${mb} MB — may be slow or fail over optical transfer.`
}

export function maybeWarnLocalEntrySize(byteTotal: number): void {
  const msg = formatLocalSizeWarn(byteTotal)
  if (!msg) return
  useSnackbarStore().show(msg, { tone: 'info', ms: 5000 })
}

/**
 * After a successful import/replace: snackbar Open + Add to group (when groups exist).
 */
export function notifyLocalLibraryImport(
  router: Router,
  entry: LocalEntry,
  opts?: { openNow?: boolean; replaced?: boolean },
): void {
  const snackbar = useSnackbarStore()
  const library = useLocalLibraryStore()
  const receiveUi = useLocalReceiveUiStore()
  const openNow = !!opts?.openNow
  const verb = opts?.replaced ? 'Updated' : 'Imported'
  const hasGroups = library.groups.length > 0

  const open = () => {
    void router.push(`/library/${entry.id}`)
  }
  const addToGroup = () => {
    receiveUi.openGroupPicker([entry.id])
  }

  if (hasGroups) {
    snackbar.show(`${verb} “${entry.title}” to My Library`, {
      tone: 'ok',
      ms: 10_000,
      action: { label: 'Open', onClick: open },
      secondaryAction: { label: 'Add to group', onClick: addToGroup },
    })
  } else {
    snackbar.show(`${verb} “${entry.title}” to My Library`, {
      tone: 'ok',
      ms: 8000,
      action: { label: 'Open', onClick: open },
    })
  }
  if (openNow) open()
}

/**
 * Parse + soft-dupe gate + import/replace.
 */
export type LocalIngestResult =
  | { status: 'imported' | 'replaced'; entry: LocalEntry }
  | { status: 'opened_existing' | 'dismissed' }

export async function ingestLocalTransferFile(
  router: Router,
  file: OpticalFile,
  opts?: { openNow?: boolean },
): Promise<LocalIngestResult> {
  const library = useLocalLibraryStore()
  await library.ensureLoaded()
  const bundle = parseLocalReceiveFile(file)
  const openNow = opts?.openNow ?? bundle.openNow
  maybeWarnLocalEntrySize(bundle.byteTotal)

  const dup = library.findSoftDuplicate(bundle.title, bundle.byteTotal)
  if (dup) {
    const receiveUi = useLocalReceiveUiStore()
    return await new Promise<LocalIngestResult>((resolve) => {
      receiveUi.askDuplicate({
        existingId: dup.id,
        existingTitle: dup.title,
        incomingTitle: bundle.title,
        onOpenExisting: () => {
          void router.push(`/library/${dup.id}`)
          resolve({ status: 'opened_existing' })
        },
        onKeepBoth: async () => {
          const imported = await importLocalReceiveBundle(bundle)
          notifyLocalLibraryImport(router, imported, { openNow })
          resolve({ status: 'imported', entry: imported })
        },
        onReplace: async () => {
          const replaced = await replaceLocalReceiveBundle(dup.id, bundle)
          notifyLocalLibraryImport(router, replaced, { openNow, replaced: true })
          resolve({ status: 'replaced', entry: replaced })
        },
        onDismiss: () => resolve({ status: 'dismissed' }),
      })
    })
  }

  const imported = await importLocalReceiveBundle(bundle)
  notifyLocalLibraryImport(router, imported, { openNow })
  return { status: 'imported', entry: imported }
}
