/**
 * Classify optical receive payloads for in-app preview / Open-after-transfer.
 */
import type { OpticalFile } from '../../../vendor/decimen/shared/protocol'
import { isLocalAudioMime, isLocalImageMime, isLocalPdfMime } from '../../types/localLibrary'
import { isSingtagsCollectionFile } from './collectionTransfer'
import { isLocalDocTransferFile } from './localDocTransfer'
import { isSingtagsSheetFile } from './singtagsPayload'

export type OpticalPreviewKind = 'image' | 'pdf' | 'audio'

/** True when the optical payload is a multi-file zip archive. */
export function isOpticalMultiFileZip(file: Pick<OpticalFile, 'name' | 'type'>): boolean {
  const type = (file.type || '').toLowerCase()
  if (type === 'application/zip' || type === 'application/x-zip-compressed') return true
  return /\.zip$/i.test(file.name || '')
}

/** In-app preview kind for a raw media file (not SingTags packages). */
export function opticalPreviewKind(
  file: Pick<OpticalFile, 'name' | 'type'>,
): OpticalPreviewKind | null {
  const mime = file.type || ''
  const name = file.name || ''
  if (isLocalAudioMime(mime, name)) return 'audio'
  if (isLocalPdfMime(mime) || name.toLowerCase().endsWith('.pdf')) return 'pdf'
  if (isLocalImageMime(mime, name)) return 'image'
  return null
}

/**
 * Whether Open-after-transfer may run for this completed payload.
 * Multi-file zips and collection batches never auto-open.
 * SingTags sheet / My Library packages open via import+navigate.
 * Raw media opens in-app preview.
 */
export function canOpenOpticalAfterTransfer(file: OpticalFile): boolean {
  if (isSingtagsCollectionFile(file)) return false
  if (isOpticalMultiFileZip(file)) return false
  if (isLocalDocTransferFile(file) || isSingtagsSheetFile(file)) return true
  return opticalPreviewKind(file) != null
}

/** Blob for preview / download from an optical file payload. */
export function opticalFileBlob(file: OpticalFile): Blob {
  const copy = new Uint8Array(file.bytes.byteLength)
  copy.set(file.bytes)
  return new Blob([copy.buffer], { type: file.type || 'application/octet-stream' })
}
