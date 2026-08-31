import { describe, expect, it } from 'vitest'
import {
  InflightLimiter,
  adaptiveGlobalInflightCap,
  adaptivePackConcurrency,
  isConstrainedNetwork,
  type NetworkHints,
} from './downloadConcurrency'

describe('downloadConcurrency', () => {
  it('flags save-data / cellular / slow effectiveType as constrained', () => {
    expect(isConstrainedNetwork({ saveData: true })).toBe(true)
    expect(isConstrainedNetwork({ connectionType: 'cellular' })).toBe(true)
    expect(isConstrainedNetwork({ effectiveType: '2g' })).toBe(true)
    expect(isConstrainedNetwork({ downlink: 0.8 })).toBe(true)
    expect(isConstrainedNetwork({ hardwareConcurrency: 8, effectiveType: '4g' })).toBe(false)
  })

  it('scales sheet and published-audio fetch concurrency by device/network', () => {
    const desktop: NetworkHints = { hardwareConcurrency: 8, effectiveType: '4g' }
    const phoneSlow: NetworkHints = {
      hardwareConcurrency: 4,
      connectionType: 'cellular',
      effectiveType: '3g',
    }
    expect(adaptivePackConcurrency('sheets', desktop).fetch).toBe(24)
    expect(adaptivePackConcurrency('sheets', phoneSlow).fetch).toBe(10)
    expect(adaptivePackConcurrency('audio-fetch', desktop).fetch).toBe(16)
    expect(adaptivePackConcurrency('audio-fetch', phoneSlow).fetch).toBe(6)
    expect(adaptivePackConcurrency('audio-fetch', desktop).transform).toBe(0)
  })

  it('keeps re-encode transform slots small while allowing fetch ahead', () => {
    const desktop: NetworkHints = { hardwareConcurrency: 8, effectiveType: '4g' }
    const lowEnd: NetworkHints = { hardwareConcurrency: 2, effectiveType: '4g' }
    const re = adaptivePackConcurrency('audio-reencode', desktop)
    expect(re.transform).toBe(2)
    expect(re.fetch).toBeGreaterThan(re.transform)
    const low = adaptivePackConcurrency('audio-reencode', lowEnd)
    expect(low.transform).toBe(1)
    expect(low.fetch).toBeGreaterThanOrEqual(low.transform)
  })

  it('caps global in-flight lower on constrained networks', () => {
    expect(adaptiveGlobalInflightCap({ hardwareConcurrency: 8, effectiveType: '4g' })).toBe(20)
    expect(adaptiveGlobalInflightCap({ saveData: true })).toBe(12)
  })

  it('InflightLimiter serializes work beyond the max', async () => {
    const gate = new InflightLimiter(2)
    let concurrent = 0
    let peak = 0
    async function job(): Promise<void> {
      const release = await gate.acquire()
      concurrent++
      peak = Math.max(peak, concurrent)
      await new Promise((r) => setTimeout(r, 20))
      concurrent--
      release()
    }
    await Promise.all([job(), job(), job(), job()])
    expect(peak).toBe(2)
  })
})
