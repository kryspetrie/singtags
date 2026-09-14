/**
 * QR byte-mode capacity (ISO/IEC 18004) for versions 1–40 at ECC L and M.
 * Used to pick the densest QR that still fits a Sing Together payload.
 */

export type QrEcc = 'L' | 'M'

/** Max data bytes for byte mode, indexed by QR version (1–40). */
const BYTE_CAP_L: readonly number[] = [
  0, 17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586, 644, 718, 792,
  858, 929, 1003, 1091, 1171, 1273, 1367, 1465, 1528, 1628, 1732, 1840, 1952, 2068, 2188, 2303,
  2431, 2563, 2699, 2809, 2953,
]

const BYTE_CAP_M: readonly number[] = [
  0, 14, 26, 44, 64, 86, 108, 124, 154, 182, 216, 254, 290, 334, 365, 415, 453, 507, 563, 627,
  669, 714, 782, 860, 914, 1000, 1062, 1128, 1193, 1267, 1373, 1455, 1541, 1631, 1725, 1812,
  1914, 1992, 2102, 2216, 2331,
]

export const QR_MAX_VERSION = 40
/** Absolute ceiling: version 40, ECC L. */
export const QR_MAX_BYTES = BYTE_CAP_L[QR_MAX_VERSION]!

export function byteCapacity(version: number, ecc: QrEcc): number {
  if (version < 1 || version > QR_MAX_VERSION) return 0
  return ecc === 'L' ? BYTE_CAP_L[version]! : BYTE_CAP_M[version]!
}

export type QrFit = {
  version: number
  ecc: QrEcc
  usedBytes: number
  maxBytes: number
  /** usedBytes / capacity of chosen QR */
  pct: number
  /** usedBytes / absolute max (v40 L) */
  pctOfAbsoluteMax: number
}

/**
 * Prefer smallest version at ECC M; fall back to L. Returns null if payload
 * exceeds version 40 L.
 */
export function fitQrPayload(usedBytes: number): QrFit | null {
  if (usedBytes < 0) return null
  for (const ecc of ['M', 'L'] as const) {
    for (let v = 1; v <= QR_MAX_VERSION; v++) {
      const maxBytes = byteCapacity(v, ecc)
      if (usedBytes <= maxBytes) {
        return {
          version: v,
          ecc,
          usedBytes,
          maxBytes,
          pct: maxBytes > 0 ? usedBytes / maxBytes : 1,
          pctOfAbsoluteMax: QR_MAX_BYTES > 0 ? usedBytes / QR_MAX_BYTES : 1,
        }
      }
    }
  }
  return null
}
