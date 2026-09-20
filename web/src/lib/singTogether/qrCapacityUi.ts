/**
 * Pure QR capacity meter / error message helpers for Sing Together.
 */
import { QR_MAX_BYTES } from './capacity'

export type CapacitySnapshot = {
  usedBytes: number
  warn: boolean
  critical: boolean
  fit: { version: number; ecc: string } | null
}

export function qrCapacityPercent(
  usedBytes: number,
  absMax: number = QR_MAX_BYTES,
): number {
  if (absMax <= 0) return 100
  return Math.min(100, Math.round((usedBytes / absMax) * 100))
}

export function qrCapacityAriaLabel(
  usedBytes: number,
  absMax: number = QR_MAX_BYTES,
): string {
  return `QR capacity used ${qrCapacityPercent(usedBytes, absMax)} percent`
}

export function qrCapacityHint(cap: Pick<CapacitySnapshot, 'warn' | 'critical'>): string | null {
  if (cap.critical) return 'Full — remove songs or shorten titles/arrangers.'
  if (cap.warn) return 'Getting full — consider trimming songs.'
  return null
}

export function qrTooLargeError(
  usedBytes: number,
  absMax: number = QR_MAX_BYTES,
): string {
  return `Too large for one QR (${usedBytes} / ${absMax} B). Remove songs.`
}

/** True when refreshQr should refuse to encode. */
export function shouldBlockQrEncode(cap: Pick<CapacitySnapshot, 'critical' | 'fit'>): boolean {
  return !!(cap.critical && !cap.fit)
}
