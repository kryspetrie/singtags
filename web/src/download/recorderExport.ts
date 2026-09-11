/**
 * Export recorder takes / sessions as files or zips.
 * Bakes saved take edits (normalize + compress + pitch/speed) into downloads.
 */
import { IDENTITY_TRANSFORM, type AudioTransform, type UserDownloadFormat } from '../types/audio'
import { isIdentityTransform, transformFilenameSuffix } from '../types/audio'
import { downloadBlob, buildZip } from './zip'
import { audioBufferToWav, downloadFilename, prepareDownloadBytes } from './transform'
import type { RecorderSession, RecorderTake } from '../types/recorder'
import { getRecorderBlob, listTakesForSession } from '../offline/recorderDb'
import {
  applyTakeLevelEdits,
  isIdentityTakeEdits,
  normalizeRecorderTakeEdits,
  takeEditsTransform,
} from '../audio/takeEdits'
import { processOfflineTransform } from '../audio/bakeClient'
import { decodeAudioBytes } from '../audio/cropAudioBuffer'

/** Recorder download: keep capture container, or re-encode. */
export type RecorderDownloadFormat = 'original' | UserDownloadFormat

export const RECORDER_DOWNLOAD_FORMAT_OPTIONS: Array<{
  value: RecorderDownloadFormat
  label: string
}> = [
  { value: 'original', label: 'Original' },
  { value: 'mp3', label: 'MP3' },
  { value: 'm4a', label: 'M4A (AAC)' },
]

function safeName(s: string, fallback: string): string {
  const t = s.replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48)
  return t || fallback
}

function extensionForMime(mime: string): string {
  const m = mime.toLowerCase()
  if (m.includes('wav')) return 'wav'
  if (m.includes('ogg')) return 'ogg'
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a'
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3'
  if (m.includes('webm')) return 'webm'
  return 'audio'
}

function mimeForDownload(mime: string): string {
  return mime || 'application/octet-stream'
}

async function bakeEditAudio(
  raw: Uint8Array,
  take: RecorderTake,
): Promise<{ data: Uint8Array; transform: AudioTransform; compressed: boolean }> {
  const edits = normalizeRecorderTakeEdits(take.edits ?? { pitchSemitones: 0, speed: 1, normalize: false, compress: null })
  const data = await applyTakeLevelEdits(raw, edits)
  return {
    data,
    transform: takeEditsTransform(edits),
    compressed: Boolean(edits.compress || edits.normalize),
  }
}

async function encodeTakeBytes(
  raw: Uint8Array,
  format: UserDownloadFormat,
  transform: AudioTransform,
): Promise<Uint8Array> {
  return prepareDownloadBytes({
    input: raw,
    format,
    transform,
    encodeQuality: 'standard',
  })
}

async function bakeToWav(raw: Uint8Array, transform: AudioTransform): Promise<Uint8Array> {
  if (isIdentityTransform(transform)) return raw
  const decoded = await decodeAudioBytes(raw)
  const processed = await processOfflineTransform(decoded, transform.pitchSemitones, transform.speed, {
    sourceRevision: 'recorder-export',
  })
  if (!processed) throw new Error('Pitch/speed transform unavailable for export')
  return audioBufferToWav(processed)
}

async function prepareTakeExport(
  take: RecorderTake,
  format: RecorderDownloadFormat,
): Promise<{ data: Uint8Array; fileName: string; mime: string } | null> {
  const blob = await getRecorderBlob(take.id)
  if (!blob) return null
  const raw = new Uint8Array(blob.data)
  const base = safeName(take.label, take.id)
  const identityEdits = isIdentityTakeEdits(take.edits)

  if (format === 'original' && identityEdits) {
    const ext = extensionForMime(blob.mime)
    return { data: raw, fileName: `${base}.${ext}`, mime: mimeForDownload(blob.mime) }
  }

  const baked = await bakeEditAudio(raw, take)

  if (format === 'original') {
    const data = await bakeToWav(baked.data, baked.transform)
    return {
      data,
      fileName: `${base}${transformFilenameSuffix(baked.transform)}.wav`,
      mime: 'audio/wav',
    }
  }

  const data = await encodeTakeBytes(baked.data, format, baked.transform)
  return {
    data,
    fileName: downloadFilename(base, format, baked.transform),
    mime: format === 'm4a' ? 'audio/mp4' : 'audio/mpeg',
  }
}

export async function exportTakeFile(
  take: RecorderTake,
  sessionName: string,
  format: RecorderDownloadFormat,
): Promise<void> {
  const prepared = await prepareTakeExport(take, format)
  if (!prepared) throw new Error('Take audio missing')
  const prefix = safeName(sessionName, 'session')
  downloadBlob(prepared.data, `${prefix}_${prepared.fileName}`, prepared.mime)
}

export async function exportSessionZip(
  session: RecorderSession,
  format: RecorderDownloadFormat,
): Promise<void> {
  const takes = await listTakesForSession(session.id)
  if (!takes.length) throw new Error('Session has no takes')
  const folder = safeName(session.name, session.id)
  const files: Array<{ name: string; data: Uint8Array }> = []
  for (const take of takes) {
    const prepared = await prepareTakeExport(take, format)
    if (!prepared) continue
    files.push({ name: `${folder}/${prepared.fileName}`, data: prepared.data })
  }
  if (!files.length) throw new Error('No take audio found')
  const zipped = buildZip(files)
  downloadBlob(zipped, `${folder}.zip`, 'application/zip')
}

export async function exportSessionsZip(
  sessions: RecorderSession[],
  format: RecorderDownloadFormat,
): Promise<void> {
  if (!sessions.length) throw new Error('No sessions selected')
  const files: Array<{ name: string; data: Uint8Array }> = []
  for (const session of sessions) {
    const takes = await listTakesForSession(session.id)
    const folder = safeName(session.name, session.id)
    for (const take of takes) {
      const prepared = await prepareTakeExport(take, format)
      if (!prepared) continue
      files.push({ name: `${folder}/${prepared.fileName}`, data: prepared.data })
    }
  }
  if (!files.length) throw new Error('No take audio found')
  const zipped = buildZip(files)
  downloadBlob(zipped, `recorder-sessions-${sessions.length}.zip`, 'application/zip')
}

/** @internal test helper */
export async function encodeRecorderTakeForTests(
  raw: Uint8Array,
  format: UserDownloadFormat,
): Promise<Uint8Array> {
  return encodeTakeBytes(raw, format, IDENTITY_TRANSFORM)
}
