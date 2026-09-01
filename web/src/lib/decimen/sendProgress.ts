/**
 * Loose send-side progress for an optical transfer stream.
 */
import { estimateTransferProgress } from '../../../vendor/decimen/shared/progress'

export type DecimenSendStreamProgress = {
  framesTransmitted: number
  sourceBlocks: number
  totalBytes: number
  bytesEstimate: number
  fraction: number
  percent: number
  phase: 'collecting' | 'decoding'
  /** True once enough frames have likely been shown for a clean receive. */
  likelyComplete: boolean
}

export function estimateSendTransferProgress(
  sourceBlocks: number,
  framesTransmitted: number,
  totalBytes: number,
  elapsedSeconds: number,
): DecimenSendStreamProgress {
  const estimate = estimateTransferProgress(
    sourceBlocks,
    framesTransmitted,
    elapsedSeconds,
    0,
  )
  const bytesEstimate = Math.min(
    totalBytes,
    Math.max(0, Math.round(estimate.fraction * totalBytes)),
  )
  const likelyComplete =
    estimate.fraction >= 0.96 || framesTransmitted >= estimate.expectedFrames
  return {
    framesTransmitted,
    sourceBlocks,
    totalBytes,
    bytesEstimate,
    fraction: estimate.fraction,
    percent: Math.round(estimate.fraction * 1000) / 10,
    phase: estimate.phase,
    likelyComplete,
  }
}
