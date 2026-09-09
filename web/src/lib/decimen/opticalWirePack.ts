/**
 * Optical file container pack/unpack with transparent XZ (LZMA2) when it wins,
 * else Decimen’s built-in gzip/none path. Receive always yields plain file bytes.
 */
import {
  isPrecompressedType,
  packFile,
  unpackFile,
  type OpticalFile,
  type PackedOpticalFile,
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
} from '../../../vendor/decimen/shared/protocol'
import { OpticalError } from '../../../vendor/decimen/shared/optical-error'
import { shouldTryXz, xzCompress, xzDecompress } from './opticalXz'

/** DCF2 compression byte: 0 none, 1 gzip (Decimen), 2 xz (SingTags). */
const COMPRESSION_XZ = 2
const FILE_HEADER_LEN = 49
const FILE_MAGIC = new Uint8Array([0x44, 0x43, 0x46, 0x32]) // DCF2

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function safeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() || 'file'
  return base.replace(/[\0\r\n]/g, '_') || 'file'
}

async function digest(bytes: Uint8Array): Promise<Uint8Array> {
  const stable = Uint8Array.from(bytes)
  return new Uint8Array(await crypto.subtle.digest('SHA-256', stable))
}

async function packWithXz(
  name: string,
  type: string,
  bytes: Uint8Array,
  compressed: Uint8Array,
): Promise<PackedOpticalFile> {
  const nameBytes = textEncoder.encode(safeFileName(name))
  const typeBytes = textEncoder.encode(type || 'application/octet-stream')
  if (nameBytes.length > 0xffff || typeBytes.length > 0xffff) {
    throw new OpticalError('fileNameTooLong')
  }
  const sha256 = await digest(bytes)
  const out = new Uint8Array(
    FILE_HEADER_LEN + nameBytes.length + typeBytes.length + compressed.length,
  )
  const view = new DataView(out.buffer)
  out.set(FILE_MAGIC, 0)
  view.setUint8(4, COMPRESSION_XZ)
  view.setUint16(5, nameBytes.length, true)
  view.setUint16(7, typeBytes.length, true)
  view.setUint32(9, bytes.length, true)
  view.setUint32(13, compressed.length, true)
  out.set(sha256, 17)
  out.set(nameBytes, FILE_HEADER_LEN)
  out.set(typeBytes, FILE_HEADER_LEN + nameBytes.length)
  out.set(compressed, FILE_HEADER_LEN + nameBytes.length + typeBytes.length)
  return {
    container: out,
    compression: 'none', // PackedOpticalFile type only knows none|gzip; xz is wire-only
    originalSize: bytes.length,
    transmittedSize: compressed.length,
  }
}

async function unpackXzContainer(container: Uint8Array): Promise<OpticalFile> {
  if (container.length < FILE_HEADER_LEN) throw new OpticalError('containerTruncated')
  for (let i = 0; i < FILE_MAGIC.length; i++) {
    if (container[i] !== FILE_MAGIC[i]) throw new OpticalError('containerBadMagic')
  }
  const view = new DataView(container.buffer, container.byteOffset, container.byteLength)
  if (view.getUint8(4) !== COMPRESSION_XZ) throw new OpticalError('containerBadCompression')
  const nameLength = view.getUint16(5, true)
  const typeLength = view.getUint16(7, true)
  const fileLength = view.getUint32(9, true)
  const transmittedLength = view.getUint32(13, true)
  const dataOffset = FILE_HEADER_LEN + nameLength + typeLength
  if (
    fileLength === 0 ||
    fileLength > MAX_FILE_BYTES ||
    transmittedLength === 0 ||
    transmittedLength > MAX_FILE_BYTES ||
    dataOffset + transmittedLength !== container.length
  ) {
    throw new OpticalError('containerLengthMismatch')
  }
  const transmitted = container.slice(dataOffset)
  const bytes = await xzDecompress(transmitted, fileLength)
  if (bytes.length !== fileLength) {
    throw new OpticalError('decompressedLengthMismatch')
  }
  return {
    name: safeFileName(
      textDecoder.decode(container.subarray(FILE_HEADER_LEN, FILE_HEADER_LEN + nameLength)),
    ),
    type:
      textDecoder.decode(container.subarray(FILE_HEADER_LEN + nameLength, dataOffset)) ||
      'application/octet-stream',
    sha256: container.slice(17, 49),
    bytes,
    compression: 'none',
    transmittedSize: transmittedLength,
  }
}

/**
 * Pack for optical wire: prefer XZ when it shrinks the payload, else Decimen gzip/none.
 */
export async function packOpticalFile(
  name: string,
  type: string,
  bytes: Uint8Array,
): Promise<PackedOpticalFile> {
  if (bytes.length === 0) throw new OpticalError('fileEmpty')
  if (bytes.length > MAX_FILE_BYTES) {
    throw new OpticalError('fileOverLimit', { limit: MAX_FILE_LABEL })
  }

  if (shouldTryXz(bytes.length) && !isPrecompressedType(type || 'application/octet-stream')) {
    try {
      const compressed = await xzCompress(bytes)
      if (compressed.length + 64 < bytes.length) {
        return packWithXz(name, type, bytes, compressed)
      }
    } catch {
      /* fall through to Decimen gzip */
    }
  }
  return packFile(name, type, bytes)
}

/** Unpack optical container; XZ/gzip are transparent — result is always plain file bytes. */
export async function unpackOpticalFile(container: Uint8Array): Promise<OpticalFile> {
  if (container.length >= 5 && container[4] === COMPRESSION_XZ) {
    return unpackXzContainer(container)
  }
  return unpackFile(container)
}
