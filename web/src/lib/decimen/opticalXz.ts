/**
 * XZ / LZMA2 compress + decompress for optical wire payloads (transparent to users).
 */
import { compress, decompress, initWasm } from 'lzma-wasm'

let ready: Promise<void> | null = null

async function ensureXz(): Promise<void> {
  if (!ready) {
    ready = initWasm().then(() => undefined)
  }
  await ready
}

/** Compress bytes with XZ (LZMA2). Level 6 balances ratio vs phone CPU. */
export async function xzCompress(bytes: Uint8Array, level = 6): Promise<Uint8Array> {
  await ensureXz()
  const copy = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes
    : Uint8Array.from(bytes)
  return compress(copy, { format: 'xz', level })
}

/** Decompress XZ bytes. Caps output via expected size when known. */
export async function xzDecompress(
  bytes: Uint8Array,
  expectedSize?: number,
): Promise<Uint8Array> {
  await ensureXz()
  const copy = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes
    : Uint8Array.from(bytes)
  if (expectedSize != null && expectedSize > 0) {
    return decompress(copy, { expectedSize })
  }
  return decompress(copy)
}

/** True when XZ wrapper is worth trying (size + not already dense media). */
export function shouldTryXz(byteLength: number): boolean {
  return byteLength >= 768
}
