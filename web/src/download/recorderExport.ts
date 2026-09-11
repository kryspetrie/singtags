/**
 * Export recorder takes / sessions as files or zips.
 * Always re-encodes (never catalog-style “original” passthrough) so WebM/WAV
 * takes become real MP3/M4A files.
 */
import { IDENTITY_TRANSFORM, type UserDownloadFormat } from '../types/audio'
import { downloadBlob, buildZip } from './zip'
import { downloadFilename, prepareDownloadBytes } from './transform'
import type { RecorderSession, RecorderTake } from '../types/recorder'
import { getRecorderBlob, listTakesForSession } from '../offline/recorderDb'

/** Recorder-specific format picker (honest labels; always re-encode). */
export const RECORDER_DOWNLOAD_FORMAT_OPTIONS: Array<{
  value: UserDownloadFormat
  label: string
}> = [
  { value: 'mp3', label: 'MP3' },
  { value: 'm4a', label: 'M4A (AAC)' },
]

function safeName(s: string, fallback: string): string {
  const t = s.replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48)
  return t || fallback
}

async function encodeTakeBytes(
  raw: Uint8Array,
  format: UserDownloadFormat,
): Promise<Uint8Array> {
  return prepareDownloadBytes({
    input: raw,
    format,
    transform: IDENTITY_TRANSFORM,
    // Never 'original' — that would passthrough WebM as a fake .mp3.
    encodeQuality: 'standard',
  })
}

export async function exportTakeFile(
  take: RecorderTake,
  sessionName: string,
  format: UserDownloadFormat,
): Promise<void> {
  const blob = await getRecorderBlob(take.id)
  if (!blob) throw new Error('Take audio missing')
  const raw = new Uint8Array(blob.data)
  const data = await encodeTakeBytes(raw, format)
  const base = `${safeName(sessionName, 'session')}_${safeName(take.label, 'take')}`
  const name = downloadFilename(base, format, IDENTITY_TRANSFORM)
  const mime = format === 'm4a' ? 'audio/mp4' : 'audio/mpeg'
  downloadBlob(data, name, mime)
}

export async function exportSessionZip(
  session: RecorderSession,
  format: UserDownloadFormat,
): Promise<void> {
  const takes = await listTakesForSession(session.id)
  if (!takes.length) throw new Error('Session has no takes')
  const folder = safeName(session.name, session.id)
  const files: Array<{ name: string; data: Uint8Array }> = []
  for (const take of takes) {
    const blob = await getRecorderBlob(take.id)
    if (!blob) continue
    const raw = new Uint8Array(blob.data)
    const data = await encodeTakeBytes(raw, format)
    const file = downloadFilename(safeName(take.label, take.id), format, IDENTITY_TRANSFORM)
    files.push({ name: `${folder}/${file}`, data })
  }
  if (!files.length) throw new Error('No take audio found')
  const zipped = buildZip(files)
  downloadBlob(zipped, `${folder}.zip`, 'application/zip')
}

export async function exportSessionsZip(
  sessions: RecorderSession[],
  format: UserDownloadFormat,
): Promise<void> {
  if (!sessions.length) throw new Error('No sessions selected')
  const files: Array<{ name: string; data: Uint8Array }> = []
  for (const session of sessions) {
    const takes = await listTakesForSession(session.id)
    const folder = safeName(session.name, session.id)
    for (const take of takes) {
      const blob = await getRecorderBlob(take.id)
      if (!blob) continue
      const raw = new Uint8Array(blob.data)
      const data = await encodeTakeBytes(raw, format)
      const file = downloadFilename(safeName(take.label, take.id), format, IDENTITY_TRANSFORM)
      files.push({ name: `${folder}/${file}`, data })
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
  return encodeTakeBytes(raw, format)
}
