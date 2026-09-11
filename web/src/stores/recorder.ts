/**
 * Pinia store for Labs Audio Recorder sessions and takes.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  DEFAULT_RECORDER_CAPTURE,
  normalizeRecorderCapture,
  type RecorderCapturePrefs,
  type RecorderLinkedLibrary,
  type RecorderLinkedTag,
  type RecorderSession,
  type RecorderTake,
} from '../types/recorder'
import {
  isIdentityTakeEdits,
  normalizeRecorderTakeEdits,
  type RecorderTakeEdits,
} from '../audio/takeEdits'
import {
  appendRecorderTake,
  clearAllRecorderCropBackups,
  deleteRecorderCropBackup,
  deleteRecorderSession,
  deleteRecorderTake,
  ensureRecorderOriginal,
  getAnyRecorderCropBackup,
  getRecorderBlob,
  getRecorderSession,
  hasRecorderOriginalDiff,
  listRecorderSessions,
  listTakesForSession,
  newRecorderSessionId,
  newRecorderTakeId,
  putRecorderCropBackup,
  putRecorderSession,
  putRecorderTake,
  sumRecorderTakeBytesFromMeta,
} from '../offline/recorderDb'

export const useRecorderStore = defineStore('recorder', () => {
  const sessions = ref<RecorderSession[]>([])
  const loaded = ref(false)
  const busy = ref(false)
  const error = ref<string | null>(null)
  const totalBytes = ref(0)

  /** One-step crop undo: previous blob for a take id. */
  const cropUndo = ref<{
    takeId: string
    mime: string
    data: ArrayBuffer
    durationSec: number
    sampleRate: number | null
    channels: 1 | 2
    byteLength: number
  } | null>(null)

  async function refresh(): Promise<void> {
    busy.value = true
    error.value = null
    try {
      sessions.value = await listRecorderSessions()
      totalBytes.value = await sumRecorderTakeBytesFromMeta()
      if (!cropUndo.value) {
        const backup = await getAnyRecorderCropBackup()
        if (backup) cropUndo.value = backup
      }
      loaded.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      busy.value = false
    }
  }

  async function createSession(opts: {
    name: string
    notes?: string
    labels?: string[]
    capture?: RecorderCapturePrefs
    linkedTag?: RecorderLinkedTag | null
    linkedLibrary?: RecorderLinkedLibrary | null
  }): Promise<RecorderSession> {
    const now = new Date().toISOString()
    const session: RecorderSession = {
      id: newRecorderSessionId(),
      name: opts.name.trim() || 'Untitled session',
      notes: opts.notes?.trim() ?? '',
      labels: opts.labels ?? [],
      linkedTag: opts.linkedTag ?? null,
      linkedLibrary: opts.linkedLibrary ?? null,
      createdAt: now,
      updatedAt: now,
      takeIds: [],
      capture: normalizeRecorderCapture(opts.capture ?? DEFAULT_RECORDER_CAPTURE),
    }
    try {
      await putRecorderSession(session)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        throw new Error('Storage full — free space or export and delete old sessions')
      }
      throw e
    }
    await refresh()
    return session
  }

  async function updateSession(
    id: string,
    patch: Partial<
      Pick<RecorderSession, 'name' | 'notes' | 'labels' | 'linkedTag' | 'linkedLibrary' | 'capture'>
    >,
  ): Promise<RecorderSession | null> {
    const cur = await getRecorderSession(id)
    if (!cur) return null
    const next: RecorderSession = {
      ...cur,
      ...patch,
      name: patch.name != null ? patch.name.trim() || cur.name : cur.name,
      updatedAt: new Date().toISOString(),
    }
    await putRecorderSession(next)
    await refresh()
    return next
  }

  async function removeSession(id: string): Promise<void> {
    await deleteRecorderSession(id)
    if (cropUndo.value) {
      const still = await getRecorderBlob(cropUndo.value.takeId)
      if (!still) {
        await deleteRecorderCropBackup(cropUndo.value.takeId)
        cropUndo.value = null
      }
    }
    await refresh()
  }

  async function loadTakes(sessionId: string): Promise<RecorderTake[]> {
    return listTakesForSession(sessionId)
  }

  async function addTake(opts: {
    sessionId: string
    label?: string
    blob: Blob
    mime: string
    durationSec: number
    channels: 1 | 2
    bitRate: number | null
    sampleRate?: number | null
  }): Promise<RecorderTake> {
    const session = await getRecorderSession(opts.sessionId)
    if (!session) throw new Error('Session not found')
    const data = await opts.blob.arrayBuffer()
    const takeId = newRecorderTakeId()
    const takeIndex = session.takeIds.length + 1
    const now = new Date().toISOString()
    const take: RecorderTake = {
      id: takeId,
      sessionId: opts.sessionId,
      label: opts.label?.trim() || `Take ${takeIndex}`,
      createdAt: now,
      recordedAt: now,
      durationSec: opts.durationSec,
      mime: opts.mime,
      sampleRate: opts.sampleRate ?? null,
      channels: opts.channels,
      bitRate: opts.bitRate,
      byteLength: data.byteLength,
      edits: null,
    }
    try {
      await appendRecorderTake(opts.sessionId, take, { id: takeId, mime: opts.mime, data })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        throw new Error('Storage full — free space or export and delete old sessions')
      }
      throw e
    }
    await refresh()
    return take
  }

  async function renameTake(takeId: string, label: string): Promise<void> {
    const { getRecorderTake } = await import('../offline/recorderDb')
    const take = await getRecorderTake(takeId)
    if (!take) return
    const blob = await getRecorderBlob(takeId)
    if (!blob) return
    await putRecorderTake({ ...take, label: label.trim() || take.label }, blob)
    const session = await getRecorderSession(take.sessionId)
    if (session) {
      await putRecorderSession({ ...session, updatedAt: new Date().toISOString() })
    }
    await refresh()
  }

  async function updateTakeEdits(
    takeId: string,
    edits: RecorderTakeEdits | null,
  ): Promise<RecorderTake | null> {
    const { getRecorderTake } = await import('../offline/recorderDb')
    const take = await getRecorderTake(takeId)
    if (!take) return null
    const blob = await getRecorderBlob(takeId)
    if (!blob) return null
    const normalized = edits == null ? null : normalizeRecorderTakeEdits(edits)
    const next: RecorderTake = {
      ...take,
      edits: isIdentityTakeEdits(normalized) ? null : normalized,
    }
    await putRecorderTake(next, blob)
    const session = await getRecorderSession(take.sessionId)
    if (session) {
      await putRecorderSession({ ...session, updatedAt: new Date().toISOString() })
    }
    await refresh()
    return next
  }

  async function removeTake(takeId: string): Promise<void> {
    await deleteRecorderTake(takeId)
    if (cropUndo.value?.takeId === takeId) {
      await deleteRecorderCropBackup(takeId)
      cropUndo.value = null
    }
    await refresh()
  }

  async function replaceTakeAudio(opts: {
    takeId: string
    data: ArrayBuffer
    mime: string
    durationSec: number
    sampleRate: number | null
    channels: 1 | 2
    /** When true, push current audio onto one-step undo. */
    keepUndo?: boolean
  }): Promise<RecorderTake | null> {
    const { getRecorderTake } = await import('../offline/recorderDb')
    const take = await getRecorderTake(opts.takeId)
    if (!take) return null
    const prev = await getRecorderBlob(opts.takeId)
    if (opts.keepUndo !== false && prev) {
      const backup = {
        takeId: take.id,
        mime: prev.mime,
        data: prev.data.slice(0),
        durationSec: take.durationSec,
        sampleRate: take.sampleRate,
        channels: take.channels,
        byteLength: take.byteLength,
      }
      cropUndo.value = backup
      try {
        await clearAllRecorderCropBackups()
        await putRecorderCropBackup(backup)
      } catch {
        /* memory undo still works if IDB backup fails */
      }
    }
    const next: RecorderTake = {
      ...take,
      mime: opts.mime,
      durationSec: opts.durationSec,
      sampleRate: opts.sampleRate,
      channels: opts.channels,
      byteLength: opts.data.byteLength,
      bitRate: null,
      // Keep original capture timestamp through edits.
      recordedAt: take.recordedAt || take.createdAt,
    }
    try {
      await putRecorderTake(next, { id: take.id, mime: opts.mime, data: opts.data })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        throw new Error('Storage full — could not save cropped take')
      }
      throw e
    }
    const session = await getRecorderSession(take.sessionId)
    if (session) {
      await putRecorderSession({ ...session, updatedAt: new Date().toISOString() })
    }
    await refresh()
    return next
  }

  async function undoLastCrop(): Promise<RecorderTake | null> {
    const u = cropUndo.value
    if (!u) return null
    cropUndo.value = null
    await deleteRecorderCropBackup(u.takeId)
    return replaceTakeAudio({
      takeId: u.takeId,
      data: u.data,
      mime: u.mime,
      durationSec: u.durationSec,
      sampleRate: u.sampleRate,
      channels: u.channels,
      keepUndo: false,
    })
  }

  async function takeIsModified(takeId: string): Promise<boolean> {
    const { getRecorderTake } = await import('../offline/recorderDb')
    const take = await getRecorderTake(takeId)
    if (!take) return false
    await ensureRecorderOriginal(take)
    return hasRecorderOriginalDiff(takeId)
  }

  async function restoreOriginalTake(takeId: string): Promise<RecorderTake | null> {
    const { getRecorderTake } = await import('../offline/recorderDb')
    const take = await getRecorderTake(takeId)
    if (!take) return null
    const orig = await ensureRecorderOriginal(take)
    if (!orig) return null
    return replaceTakeAudio({
      takeId,
      data: orig.data,
      mime: orig.mime,
      durationSec: orig.durationSec,
      sampleRate: orig.sampleRate,
      channels: orig.channels,
      keepUndo: false,
    })
  }

  async function takeObjectUrl(takeId: string): Promise<string | null> {
    const blob = await getRecorderBlob(takeId)
    if (!blob) return null
    return URL.createObjectURL(new Blob([blob.data], { type: blob.mime }))
  }

  async function takeBytes(takeId: string): Promise<{ mime: string; data: Uint8Array } | null> {
    const blob = await getRecorderBlob(takeId)
    if (!blob) return null
    return { mime: blob.mime, data: new Uint8Array(blob.data) }
  }

  /** Immutable first-capture bytes (seeds from current if missing). */
  async function takeOriginalBytes(takeId: string): Promise<{
    mime: string
    data: Uint8Array
    durationSec: number
    sampleRate: number | null
    channels: 1 | 2
  } | null> {
    const { getRecorderTake, ensureRecorderOriginal } = await import('../offline/recorderDb')
    const take = await getRecorderTake(takeId)
    if (!take) return null
    const orig = await ensureRecorderOriginal(take)
    if (!orig) return null
    return {
      mime: orig.mime,
      data: new Uint8Array(orig.data),
      durationSec: orig.durationSec,
      sampleRate: orig.sampleRate,
      channels: orig.channels,
    }
  }

  return {
    sessions,
    loaded,
    busy,
    error,
    totalBytes,
    cropUndo,
    refresh,
    createSession,
    updateSession,
    removeSession,
    loadTakes,
    addTake,
    renameTake,
    updateTakeEdits,
    removeTake,
    replaceTakeAudio,
    undoLastCrop,
    takeIsModified,
    restoreOriginalTake,
    takeObjectUrl,
    takeBytes,
    takeOriginalBytes,
  }
})
