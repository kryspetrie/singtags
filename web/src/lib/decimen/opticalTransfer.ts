/**
 * Pack arbitrary files (or a zip of many) for Decimen optical transfer.
 */
import { buildZip, downloadBlob } from '../../download/zip'
import {
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
  packFile,
  type OpticalFile,
} from '../../../vendor/decimen/shared/protocol'
import { sourceBlockCount } from '../../../vendor/decimen/shared/frame-capacity'
import { expectedFountainOverhead, formatDuration } from '../../../vendor/decimen/shared/progress'
import {
  DEFAULT_OPTICAL_FRAME_BYTES,
  DEFAULT_OPTICAL_TX_FPS,
} from './sendSettings'

export { DEFAULT_OPTICAL_FRAME_BYTES as OPTICAL_SEND_FRAME_BYTES }
export { DEFAULT_OPTICAL_TX_FPS as OPTICAL_SEND_TX_FPS }

export type OpticalSendEstimate = {
  payloadBytes: number
  containerBytes: number
  sourceBlocks: number
  expectedFrames: number
  etaSeconds: number
  etaLabel: string
}

/** Estimate QR stream duration from a packed container size. */
export function estimateOpticalSendFromContainer(
  containerBytes: number,
  frameBytes = DEFAULT_OPTICAL_FRAME_BYTES,
  txFps = DEFAULT_OPTICAL_TX_FPS,
): OpticalSendEstimate {
  const sourceBlocks = Math.max(1, sourceBlockCount(containerBytes, frameBytes))
  const expectedFrames = Math.max(
    sourceBlocks + 1,
    Math.ceil(sourceBlocks * expectedFountainOverhead(sourceBlocks)),
  )
  const etaSeconds = expectedFrames / txFps
  return {
    payloadBytes: containerBytes,
    containerBytes,
    sourceBlocks,
    expectedFrames,
    etaSeconds,
    etaLabel: formatDuration(etaSeconds),
  }
}

export async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}

export function transferArchiveName(count: number): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  return `transfer-${count}-files-${stamp}.zip`
}

function zipEntryName(name: string, used: Map<string, number>): string {
  const base = name.split(/[/\\]/).pop() || 'file'
  const seen = used.get(base) ?? 0
  used.set(base, seen + 1)
  if (seen === 0) return base
  const dot = base.lastIndexOf('.')
  if (dot > 0) return `${base.slice(0, dot)}-${seen}${base.slice(dot)}`
  return `${base}-${seen}`
}

/** Zip multiple browser files, preserving basenames (deduped when needed). */
export async function zipFilesForTransfer(files: File[]): Promise<Uint8Array> {
  const used = new Map<string, number>()
  const entries = await Promise.all(
    files.map(async (file) => ({
      name: zipEntryName(file.name, used),
      data: await readFileBytes(file),
    })),
  )
  return buildZip(entries)
}

export type PreparedOpticalTransfer = {
  container: Uint8Array
  sendName: string
  sendType: string
  payloadBytes: number
  fileCount: number
}

/** Pack one or more files into a Decimen file container ready to stream. */
export async function prepareOpticalTransfer(files: File[]): Promise<PreparedOpticalTransfer> {
  if (files.length === 0) throw new Error('Choose at least one file.')

  let payload: Uint8Array
  let sendName: string
  let sendType: string

  if (files.length === 1) {
    const file = files[0]!
    payload = await readFileBytes(file)
    sendName = file.name
    sendType = file.type || 'application/octet-stream'
  } else {
    payload = await zipFilesForTransfer(files)
    sendName = transferArchiveName(files.length)
    sendType = 'application/zip'
  }

  if (payload.length > MAX_FILE_BYTES) {
    throw new Error(`Total size exceeds ${MAX_FILE_LABEL}. Remove some files or send fewer at once.`)
  }

  const packed = await packFile(sendName, sendType, payload)
  return {
    container: packed.container,
    sendName,
    sendType,
    payloadBytes: payload.length,
    fileCount: files.length,
  }
}

export type PreparedSendPreview = PreparedOpticalTransfer & {
  estimate: OpticalSendEstimate
}

/** Rough send-time preview from file sizes — no packing or hashing. */
export function estimateOpticalTransferPreview(
  files: File[],
  frameBytes = DEFAULT_OPTICAL_FRAME_BYTES,
  txFps = DEFAULT_OPTICAL_TX_FPS,
): OpticalSendEstimate & {
  sendName: string
  fileCount: number
} {
  if (!files.length) throw new Error('Choose at least one file.')
  const payloadBytes = files.reduce((sum, file) => sum + file.size, 0)
  if (payloadBytes > MAX_FILE_BYTES) {
    throw new Error(`Total size exceeds ${MAX_FILE_LABEL}. Remove some files or send fewer at once.`)
  }
  const sendName = files.length === 1 ? files[0]!.name : transferArchiveName(files.length)
  // Header, name/type fields, and optional gzip — conservative vs. actual packFile().
  const nameOverhead = sendName.length + 48
  const containerBytes = Math.max(256, Math.ceil(payloadBytes * 1.08) + nameOverhead)
  return {
    ...estimateOpticalSendFromContainer(containerBytes, frameBytes, txFps),
    payloadBytes,
    sendName,
    fileCount: files.length,
  }
}

/** Pack files and attach send-time / size estimates for the UI. */
export async function previewOpticalTransfer(files: File[]): Promise<PreparedSendPreview> {
  const prepared = await prepareOpticalTransfer(files)
  return {
    ...prepared,
    estimate: {
      ...estimateOpticalSendFromContainer(prepared.container.length),
      payloadBytes: prepared.payloadBytes,
    },
  }
}

/** Trigger a browser download of one received optical file. */
export function saveOpticalFile(file: OpticalFile): void {
  downloadBlob(file.bytes, file.name, file.type || 'application/octet-stream')
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
}

/** Save files to a picked folder when supported, otherwise download each file. */
export async function saveOpticalFiles(files: OpticalFile[]): Promise<'directory' | 'download'> {
  if (!files.length) return 'download'
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker
  if (picker) {
    try {
      const dir = await picker.call(window)
      for (const file of files) {
        const handle = await dir.getFileHandle(file.name, { create: true })
        const writable = await handle.createWritable()
        await writable.write(new Uint8Array(file.bytes))
        await writable.close()
      }
      return 'directory'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
    }
  }
  for (const file of files) saveOpticalFile(file)
  return 'download'
}
