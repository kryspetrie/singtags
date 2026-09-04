/**
 * Pack/unpack Local Library entries for Decimen optical transfer.
 * v1: single-file local-doc. v2: entry + multiple assets.
 */
import { deflateSync, inflateSync } from 'fflate'
import { packFile, unpackFile, type OpticalFile } from '../../../vendor/decimen/shared/protocol'
import type { LocalAsset, LocalAssetRole, LocalEntry } from '../../types/localLibrary'

export const LOCAL_DOC_TRANSFER_MIME = 'application/vnd.singtags.local-doc'
export const LOCAL_ENTRY_TRANSFER_MIME = 'application/vnd.singtags.local-entry'

/** @deprecated v1 single-file package meta */
export type LocalDocTransferMeta = {
  v: 1
  title: string
  arranger: string
  notes: string
  key: string | null
  detuneCents: number
  mime: string
  filename: string
  openNow?: boolean
}

export type LocalDocTransferPackage = {
  meta: LocalDocTransferMeta
  bytes: Uint8Array
}

export type LocalEntryTransferAsset = {
  role: LocalAssetRole
  label: string
  mime: string
  filename: string
  /** Base64 of asset bytes (JSON-friendly inside deflated payload). */
  dataB64: string
  sortIndex: number
}

export type LocalEntryTransferMeta = {
  v: 2
  title: string
  arranger: string
  notes: string
  key: string | null
  detuneCents: number
  openNow?: boolean
  assets: LocalEntryTransferAsset[]
}

export type LocalEntryTransferPackage = {
  meta: LocalEntryTransferMeta
}

function textEncoder(): TextEncoder {
  return new TextEncoder()
}

function textDecoder(): TextDecoder {
  return new TextDecoder()
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, false)
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, false)
}

function bytesToB64(bytes: Uint8Array): string {
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(s)
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function packLocalDocPayload(pkg: LocalDocTransferPackage): Uint8Array {
  const metaJson = textEncoder().encode(JSON.stringify(pkg.meta))
  const raw = new Uint8Array(4 + metaJson.length + pkg.bytes.length)
  writeU32(new DataView(raw.buffer), 0, metaJson.length)
  raw.set(metaJson, 4)
  raw.set(pkg.bytes, 4 + metaJson.length)
  return deflateSync(raw, { level: 6 })
}

export function unpackLocalDocPayload(compressed: Uint8Array): LocalDocTransferPackage {
  const raw = inflateSync(compressed)
  if (raw.length < 4) throw new Error('Local doc package too short')
  const metaLen = readU32(new DataView(raw.buffer, raw.byteOffset, 4), 0)
  if (metaLen < 2 || 4 + metaLen > raw.length) throw new Error('Invalid local doc metadata length')
  const metaText = textDecoder().decode(raw.subarray(4, 4 + metaLen))
  const meta = JSON.parse(metaText) as LocalDocTransferMeta
  if (!meta || meta.v !== 1 || typeof meta.mime !== 'string') {
    throw new Error('Unsupported local doc metadata')
  }
  return { meta, bytes: raw.subarray(4 + metaLen) }
}

export function packLocalEntryPayload(pkg: LocalEntryTransferPackage): Uint8Array {
  const metaJson = textEncoder().encode(JSON.stringify(pkg.meta))
  return deflateSync(metaJson, { level: 6 })
}

export function unpackLocalEntryPayload(compressed: Uint8Array): LocalEntryTransferPackage {
  const metaText = textDecoder().decode(inflateSync(compressed))
  const meta = JSON.parse(metaText) as LocalEntryTransferMeta
  if (!meta || meta.v !== 2 || !Array.isArray(meta.assets)) {
    throw new Error('Unsupported local entry metadata')
  }
  return { meta }
}

export function localDocTransferMetaFromLegacy(
  fields: {
    title: string
    arranger: string
    notes: string
    key: string | null
    detuneCents: number
    mime: string
    filename: string
  },
  opts?: { openNow?: boolean },
): LocalDocTransferMeta {
  return {
    v: 1,
    title: fields.title,
    arranger: fields.arranger,
    notes: fields.notes,
    key: fields.key,
    detuneCents: fields.detuneCents,
    mime: fields.mime,
    filename: fields.filename,
    openNow: opts?.openNow,
  }
}

/** @deprecated */
export function localDocTransferMetaFromDoc(
  doc: {
    title: string
    arranger: string
    notes: string
    key: string | null
    detuneCents: number
    mime: string
    filename: string
  },
  opts?: { openNow?: boolean },
): LocalDocTransferMeta {
  return localDocTransferMetaFromLegacy(doc, opts)
}

export async function packLocalDocFile(
  fields: {
    id: string
    title: string
    arranger: string
    notes: string
    key: string | null
    detuneCents: number
    mime: string
    filename: string
  },
  bytes: Uint8Array,
  opts?: { openNow?: boolean },
): Promise<{ filename: string; container: Uint8Array }> {
  const meta = localDocTransferMetaFromLegacy(fields, opts)
  const payload = packLocalDocPayload({ meta, bytes })
  const filename = `singtags-local-${fields.id}.doc`
  const packed = await packFile(filename, LOCAL_DOC_TRANSFER_MIME, payload)
  return { filename, container: packed.container }
}

export async function packLocalEntryFile(
  entry: LocalEntry,
  assets: LocalAsset[],
  blobs: Map<string, Uint8Array>,
  opts?: { openNow?: boolean },
): Promise<{ filename: string; container: Uint8Array }> {
  const transferAssets: LocalEntryTransferAsset[] = assets.map((a) => {
    const bytes = blobs.get(a.id)
    if (!bytes) throw new Error(`Missing blob for asset ${a.id}`)
    return {
      role: a.role,
      label: a.label,
      mime: a.mime,
      filename: a.filename,
      dataB64: bytesToB64(bytes),
      sortIndex: a.sortIndex,
    }
  })
  const meta: LocalEntryTransferMeta = {
    v: 2,
    title: entry.title,
    arranger: entry.arranger,
    notes: entry.notes,
    key: entry.key,
    detuneCents: entry.detuneCents,
    openNow: opts?.openNow,
    assets: transferAssets,
  }
  const payload = packLocalEntryPayload({ meta })
  const filename = `singtags-local-${entry.id}.entry`
  const packed = await packFile(filename, LOCAL_ENTRY_TRANSFER_MIME, payload)
  return { filename, container: packed.container }
}

export function isLocalDocTransferFile(file: OpticalFile): boolean {
  return (
    file.type === LOCAL_DOC_TRANSFER_MIME ||
    file.type === LOCAL_ENTRY_TRANSFER_MIME ||
    /^singtags-local-.+\.(doc|entry)$/i.test(file.name)
  )
}

export function isLocalEntryTransferFile(file: OpticalFile): boolean {
  return (
    file.type === LOCAL_ENTRY_TRANSFER_MIME ||
    /^singtags-local-.+\.entry$/i.test(file.name)
  )
}

export function unpackLocalDocFile(file: OpticalFile): LocalDocTransferPackage {
  return unpackLocalDocPayload(file.bytes)
}

export function unpackLocalEntryFile(file: OpticalFile): LocalEntryTransferPackage {
  return unpackLocalEntryPayload(file.bytes)
}

export async function decodeLocalDocContainer(container: Uint8Array): Promise<LocalDocTransferPackage> {
  const file = await unpackFile(container)
  return unpackLocalDocPayload(file.bytes)
}

export function entryAssetsFromTransfer(meta: LocalEntryTransferMeta): Array<{
  role: LocalAssetRole
  label: string
  mime: string
  filename: string
  data: ArrayBuffer
  sortIndex: number
}> {
  return meta.assets.map((a) => {
    const bytes = b64ToBytes(a.dataB64)
    return {
      role: a.role,
      label: a.label,
      mime: a.mime,
      filename: a.filename,
      data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      sortIndex: a.sortIndex,
    }
  })
}
