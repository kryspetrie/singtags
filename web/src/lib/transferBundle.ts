/**
 * Shared SingTags transfer bundle for optical, WebRTC, and OS Share handoff.
 * Produces a plain File (single payload or zip) — not a Decimen fountain container.
 */
import {
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
  type OpticalFile,
} from '../../vendor/decimen/shared/protocol'
import { transferArchiveName, zipFilesForTransfer } from './decimen/opticalTransfer'

export type TransferBundle = {
  file: File
  fileCount: number
  payloadBytes: number
}

/** Pack one or more queue files into a shareable/browser File. */
export async function buildTransferBundle(files: File[]): Promise<TransferBundle> {
  if (!files.length) throw new Error('Choose at least one file.')

  let file: File
  if (files.length === 1) {
    file = files[0]!
  } else {
    const bytes = await zipFilesForTransfer(files)
    const name = transferArchiveName(files.length)
    // Copy into a fresh ArrayBuffer-backed view for File/BlobPart typing.
    const copy = Uint8Array.from(bytes)
    file = new File([copy], name, { type: 'application/zip' })
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`Total size exceeds ${MAX_FILE_LABEL}. Remove some files or send fewer at once.`)
  }

  return {
    file,
    fileCount: files.length,
    payloadBytes: file.size,
  }
}

/** Convert a browser File into the OpticalFile shape used by receive ingest. */
export async function opticalFileFromBrowserFile(file: File): Promise<OpticalFile> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const sha256 = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return {
    name: file.name,
    type: file.type || 'application/octet-stream',
    bytes,
    sha256,
    compression: 'none',
    transmittedSize: bytes.byteLength,
  }
}
