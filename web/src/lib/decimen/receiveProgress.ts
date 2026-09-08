/**
 * Receive-side fountain progress: blocks + estimated bytes for UI labels.
 */
import { formatBytes } from '../../offline/storageEstimate'

/** Byte estimate from fountain solve fraction (matches send-side style). */
export function estimateReceiveBytes(
  totalBytes: number,
  fraction: number,
): { bytesReceived: number; totalBytes: number } {
  const total = Math.max(0, Math.floor(totalBytes))
  const bytesReceived = Math.min(total, Math.max(0, Math.round(fraction * total)))
  return { bytesReceived, totalBytes: total }
}

/** Status line: blocks, bytes, and percent. */
export function formatReceiveProgressLabel(opts: {
  solved: number
  totalBlocks: number
  bytesReceived: number
  totalBytes: number
  percent: number
}): string {
  const { solved, totalBlocks, bytesReceived, totalBytes, percent } = opts
  const blocks = `${solved} / ${totalBlocks} blocks`
  if (totalBytes > 0) {
    return `${blocks} · ${formatBytes(bytesReceived)} / ${formatBytes(totalBytes)} · ${percent}%`
  }
  return `${blocks} · ${percent}%`
}
