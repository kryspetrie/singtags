/**
 * STS1 Sing Together repertoire codec: packed binary → fflate → QR bytes.
 */
import { deflateSync, inflateSync } from 'fflate'
import QRCode from 'qrcode'
import { fitQrPayload, QR_MAX_BYTES, type QrFit } from './capacity'
import {
  clampConfidence,
  emptyProfile,
  newSongId,
  normalizeAltTitles,
  partsForVoicing,
  type Confidence,
  type RepertoireProfile,
  type RepertoireSong,
  type Voicing,
  VOICINGS,
} from './types'

export const STS1_MAGIC = new TextEncoder().encode('STS1')

const te = new TextEncoder()
const td = new TextDecoder()

const VOICING_UNSPECIFIED = 0xff

function voicingByte(v: Voicing | undefined): number {
  if (!v) return VOICING_UNSPECIFIED
  const i = VOICINGS.indexOf(v)
  return i >= 0 ? i : VOICING_UNSPECIFIED
}

function voicingFromByte(b: number): Voicing | undefined {
  if (b === VOICING_UNSPECIFIED) return undefined
  return VOICINGS[b]
}

function writeU16(out: number[], n: number): void {
  out.push(n & 0xff, (n >> 8) & 0xff)
}

function readU16(buf: Uint8Array, i: number): number {
  return buf[i]! | (buf[i + 1]! << 8)
}

function pushLenString(out: number[], s: string, maxLen = 255): void {
  const bytes = te.encode(s.slice(0, maxLen))
  const len = Math.min(255, bytes.length)
  out.push(len)
  for (let i = 0; i < len; i++) out.push(bytes[i]!)
}

function readLenString(buf: Uint8Array, i: number): { s: string; next: number } {
  const len = buf[i]!
  const start = i + 1
  const end = start + len
  return { s: td.decode(buf.subarray(start, end)), next: end }
}

/** Pack profile body (before deflate). Body format 2 adds optional alt titles. */
export function packProfileBody(profile: RepertoireProfile): Uint8Array {
  const out: number[] = []
  out.push(2) // format version inside body
  pushLenString(out, profile.displayName.trim().slice(0, 64))
  const songs = profile.songs.slice(0, 500)
  writeU16(out, songs.length)
  for (const song of songs) {
    const voicing = song.voicing
    out.push(voicingByte(voicing))
    pushLenString(out, song.title.trim(), 120)
    const alts = normalizeAltTitles(song.altTitles) ?? []
    out.push(alts.length & 0xff)
    for (const alt of alts) pushLenString(out, alt, 80)
    pushLenString(out, song.arranger.trim(), 80)
    pushLenString(out, (song.key ?? '').trim(), 32)
    const allowed = partsForVoicing(voicing)
    let mask = 0
    const confs: number[] = []
    for (let p = 0; p < allowed.length; p++) {
      const id = allowed[p]!
      if (Object.prototype.hasOwnProperty.call(song.parts, id)) {
        mask |= 1 << p
        confs.push(clampConfidence(song.parts[id]!))
      }
    }
    out.push(mask & 0xff)
    for (const c of confs) out.push(c & 0x07)
  }
  return Uint8Array.from(out)
}

export function unpackProfileBody(body: Uint8Array): RepertoireProfile {
  let i = 0
  if (body.length < 4) throw new Error('STS1 body too short')
  const fmt = body[i++]!
  if (fmt !== 1 && fmt !== 2) throw new Error(`Unsupported STS1 body version ${fmt}`)
  const name = readLenString(body, i)
  i = name.next
  const count = readU16(body, i)
  i += 2
  const songs: RepertoireSong[] = []
  for (let n = 0; n < count; n++) {
    if (i >= body.length) throw new Error('STS1 truncated songs')
    const voicing = voicingFromByte(body[i++]!)
    const title = readLenString(body, i)
    i = title.next
    let altTitles: string[] | undefined
    if (fmt >= 2) {
      if (i >= body.length) throw new Error('STS1 truncated alt titles')
      const altCount = body[i++]!
      const alts: string[] = []
      for (let a = 0; a < altCount; a++) {
        const alt = readLenString(body, i)
        i = alt.next
        if (alt.s.trim()) alts.push(alt.s.trim())
      }
      altTitles = normalizeAltTitles(alts)
    }
    const arranger = readLenString(body, i)
    i = arranger.next
    const key = readLenString(body, i)
    i = key.next
    const mask = body[i++]!
    const allowed = partsForVoicing(voicing)
    const parts: Record<string, Confidence> = {}
    for (let p = 0; p < allowed.length; p++) {
      if (mask & (1 << p)) {
        const c = clampConfidence(body[i++]! & 0x07)
        parts[allowed[p]!] = c
      }
    }
    songs.push({
      id: newSongId(),
      title: title.s,
      altTitles,
      arranger: arranger.s,
      key: key.s || undefined,
      voicing,
      parts,
    })
  }
  return {
    displayName: name.s,
    songs,
    collections: [],
    updatedAt: Date.now(),
  }
}

/** Full QR payload: magic + deflated body. */
export function encodeProfileBytes(profile: RepertoireProfile): Uint8Array {
  const body = packProfileBody(profile)
  const compressed = deflateSync(body, { level: 9 })
  const out = new Uint8Array(STS1_MAGIC.length + compressed.length)
  out.set(STS1_MAGIC, 0)
  out.set(compressed, STS1_MAGIC.length)
  return out
}

export function decodeProfileBytes(raw: Uint8Array): RepertoireProfile {
  if (raw.length < STS1_MAGIC.length + 2) throw new Error('Not an STS1 payload')
  for (let i = 0; i < STS1_MAGIC.length; i++) {
    if (raw[i] !== STS1_MAGIC[i]) throw new Error('Not an STS1 payload')
  }
  const compressed = raw.subarray(STS1_MAGIC.length)
  let body: Uint8Array
  try {
    body = inflateSync(compressed)
  } catch {
    throw new Error('STS1 inflate failed')
  }
  return unpackProfileBody(body)
}

/** Also accept text that is base64url of STS1 (paste / some scanners). */
export function decodeProfileFromQr(result: {
  text: string | null
  bytes: Uint8Array | null
}): RepertoireProfile {
  if (result.bytes && result.bytes.length >= STS1_MAGIC.length) {
    try {
      return decodeProfileBytes(result.bytes)
    } catch {
      /* try text */
    }
  }
  const text = result.text?.trim()
  if (!text) throw new Error('No Sing Together QR found')
  if (text.startsWith('STS1')) {
    // Rare: magic as latin1 in text — rebuild bytes
    const bytes = new Uint8Array(text.length)
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff
    return decodeProfileBytes(bytes)
  }
  // base64url
  try {
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? b64 : b64 + '='.repeat(4 - (b64.length % 4))
    const bin = atob(pad)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return decodeProfileBytes(bytes)
  } catch {
    throw new Error('Not a Sing Together repertoire QR')
  }
}

export type EncodeQrResult = {
  bytes: Uint8Array
  fit: QrFit
  dataUrl: string
}

export async function encodeProfileQr(
  profile: RepertoireProfile,
  size = 512,
): Promise<EncodeQrResult> {
  const bytes = encodeProfileBytes(profile)
  const fit = fitQrPayload(bytes.length)
  if (!fit) {
    throw new Error(
      `Repertoire is too large for one QR (${bytes.length} B; max ${QR_MAX_BYTES} B). Remove songs to continue.`,
    )
  }
  try {
    const dataUrl = await QRCode.toDataURL([{ data: bytes, mode: 'byte' }], {
      width: size,
      margin: 1,
      errorCorrectionLevel: fit.ecc,
      version: fit.version,
    })
    return { bytes, fit, dataUrl }
  } catch {
    // Safety net if capacity tables and the renderer disagree — let qrcode pick version.
    const dataUrl = await QRCode.toDataURL([{ data: bytes, mode: 'byte' }], {
      width: size,
      margin: 1,
      errorCorrectionLevel: fit.ecc,
    })
    return { bytes, fit, dataUrl }
  }
}

export function capacityInfo(profile: RepertoireProfile): {
  usedBytes: number
  fit: QrFit | null
  warn: boolean
  critical: boolean
} {
  const bytes = encodeProfileBytes(profile)
  const fit = fitQrPayload(bytes.length)
  const pctAbs = bytes.length / QR_MAX_BYTES
  return {
    usedBytes: bytes.length,
    fit,
    warn: pctAbs >= 0.75,
    critical: !fit || pctAbs >= 0.95,
  }
}

export function isSts1Bytes(raw: Uint8Array | null | undefined): boolean {
  if (!raw || raw.length < STS1_MAGIC.length) return false
  for (let i = 0; i < STS1_MAGIC.length; i++) {
    if (raw[i] !== STS1_MAGIC[i]) return false
  }
  return true
}

export { emptyProfile, QR_MAX_BYTES }
