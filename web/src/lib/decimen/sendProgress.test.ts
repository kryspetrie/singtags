/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { estimateSendTransferProgress } from './sendProgress'

describe('sendProgress', () => {
  it('estimates bytes sent from frames transmitted', () => {
    const early = estimateSendTransferProgress(100, 10, 1_000_000, 5)
    expect(early.totalBytes).toBe(1_000_000)
    expect(early.bytesEstimate).toBeLessThan(1_000_000)
    expect(early.percent).toBeGreaterThan(0)
    expect(early.likelyComplete).toBe(false)

    const late = estimateSendTransferProgress(100, 200, 1_000_000, 60)
    expect(late.bytesEstimate).toBeGreaterThan(early.bytesEstimate)
    expect(late.likelyComplete).toBe(true)
  })
})
