/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from '../types'
import {
  candidatesForMoment,
  natureAllowlistForRisk,
  rankerDepsForWeights,
} from './candidates'
import { cadenceSeedsByTick, preferCadenceSeeds } from './cadenceSeeds'
import { weightsFromRisk } from './types'

const BASIC_W = {
  risk: 0 as const,
  voiceLeading: 0.7,
  ring: 0.3,
  cadenceBias: 'moderate' as const,
  issuePenalty: 0.55,
  stayPutEpsilon: 0.2,
  taste: 'classic' as const,
}

describe('Basic pathOptimize candidate gates', () => {
  it('rankerDepsForWeights passes moderate cadenceBias through (not global prefs)', () => {
    const deps = rankerDepsForWeights(weightsFromRisk(0.2, { cadenceBias: 'moderate' }))
    expect(deps.cadenceBias).toBe('moderate')
    const off = rankerDepsForWeights(weightsFromRisk(0.2, { cadenceBias: 'off' }))
    expect(off.cadenceBias).toBe('off')
  })

  it('natureAllowlistForRisk keeps maj/min/7/m7/ninth/sixth through default Basic band', () => {
    expect(natureAllowlistForRisk(0.2)).toEqual([
      'major',
      'minor',
      'seventh',
      'm7',
      'ninth',
      'sixth',
    ])
    expect(natureAllowlistForRisk(0.35)).toContain('sixth')
    expect(natureAllowlistForRisk(0.4)).toContain('madd6')
  })

  it('Basic risk emits maj/min/7/m7/ninth/sixth closed voicings with bass above the floor', () => {
    const p = createEmptyArrangement('basic')
    p.tonality = 0
    p.melody = [
      { id: 'm0', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
      { id: 'm1', midi: 67, startTick: 480, durationTicks: 480, role: 'smn' },
    ]
    p.pillars = [
      {
        id: 'p0',
        rootPc: 0,
        startTick: 0,
        endTick: 2000,
        source: 'user',
        confirmed: true,
      },
      {
        id: 'p1',
        rootPc: 7,
        startTick: 480,
        endTick: 2000,
        source: 'user',
        confirmed: true,
      },
    ]
    const cands = candidatesForMoment(p, p.melody[0]!, {
      topK: 24,
      weights: { ...BASIC_W, risk: 0.2 },
    })
    expect(cands.length).toBeGreaterThan(0)
    for (const c of cands) {
      expect(['major', 'minor', 'seventh', 'm7', 'ninth', 'sixth']).toContain(c.natureId)
      expect(c.spread).toBe(false)
      expect(c.midi!.bass).toBeGreaterThanOrEqual(45)
    }
    // Home triad / seventh on the pillar should outrank secondary roots for Lead on ^1.
    expect(cands[0]!.rootPc).toBe(0)
    // Lead on tonic ^1 must keep major available — octave-only span wiped triad homes.
    expect(cands.some((c) => c.natureId === 'major' && c.rootPc === 0)).toBe(true)
    expect(cands[0]!.natureId).toBe('major')
  })

  it('Basic prefers I6 when Lead is the 6th on a tonic pillar', () => {
    const p = createEmptyArrangement('i6')
    p.tonality = 0
    // Lead A (= 6 of C)
    p.melody = [{ id: 'm0', midi: 69, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p0', rootPc: 0, startTick: 0, endTick: 1000, source: 'user', confirmed: true },
    ]
    const cands = candidatesForMoment(p, p.melody[0]!, { topK: 16, weights: BASIC_W })
    expect(cands.some((c) => c.natureId === 'sixth' && c.rootPc === 0)).toBe(true)
    expect(cands[0]!.natureId).toBe('sixth')
    expect(cands[0]!.rootPc).toBe(0)
  })

  it('Basic prefers III7 when Lead is ♭7 of a mediant pillar', () => {
    const p = createEmptyArrangement('iii7')
    p.tonality = 0
    // Mediant E pillar; Lead D (= ♭7 of E) → III7
    p.melody = [{ id: 'm0', midi: 62, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p0', rootPc: 4, startTick: 0, endTick: 1000, source: 'user', confirmed: true },
    ]
    const cands = candidatesForMoment(p, p.melody[0]!, { topK: 16, weights: BASIC_W })
    expect(cands[0]!.rootPc).toBe(4)
    expect(cands[0]!.natureId).toBe('seventh')
  })

  it('Basic prefers iii triad when Lead is 3 of a mediant pillar', () => {
    const p = createEmptyArrangement('iii')
    p.tonality = 0
    // Mediant E; Lead G (= 3 of Em)
    p.melody = [{ id: 'm0', midi: 67, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p0', rootPc: 4, startTick: 0, endTick: 1000, source: 'user', confirmed: true },
    ]
    const cands = candidatesForMoment(p, p.melody[0]!, { topK: 16, weights: BASIC_W })
    expect(cands[0]!.rootPc).toBe(4)
    expect(cands[0]!.natureId).toBe('minor')
  })

  it('Basic skips sec-dom passing under chromatic pillars and prefers Mm7', () => {
    const p = createEmptyArrangement('chrom')
    p.tonality = 0
    // bV (= F#) pillar — chromatic; Lead on root
    p.melody = [{ id: 'm0', midi: 66, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p0', rootPc: 6, startTick: 0, endTick: 480, source: 'user', confirmed: true },
      { id: 'p1', rootPc: 7, startTick: 480, endTick: 1000, source: 'user', confirmed: true },
    ]
    const cands = candidatesForMoment(p, p.melody[0]!, { topK: 24, weights: BASIC_W })
    expect(cands.length).toBeGreaterThan(0)
    expect(cands.every((c) => c.rootPc === 6)).toBe(true)
    expect(cands[0]!.natureId).toBe('seventh')
  })

  it('Classic taste suppresses mid-phrase sec-dom; Circle allows it', () => {
    const p = createEmptyArrangement('midpass')
    p.tonality = 0
    // Long mid-phrase under I before a distant V pillar
    p.melody = [
      { id: 'm0', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
      { id: 'm1', midi: 62, startTick: 480, durationTicks: 480, role: 'smn' },
      { id: 'm2', midi: 64, startTick: 960, durationTicks: 480, role: 'pmn' },
      { id: 'm3', midi: 65, startTick: 1440, durationTicks: 480, role: 'smn' },
      { id: 'm4', midi: 67, startTick: 4000, durationTicks: 480, role: 'pmn' },
    ]
    p.pillars = [
      { id: 'p0', rootPc: 0, startTick: 0, endTick: 4000, source: 'user', confirmed: true },
      { id: 'p1', rootPc: 7, startTick: 4000, endTick: 5000, source: 'user', confirmed: true },
    ]
    const classic = candidatesForMoment(p, p.melody[1]!, {
      topK: 24,
      weights: { ...BASIC_W, taste: 'classic' },
    })
    expect(classic.every((c) => c.rootPc === 0 || c.layer === 'primary')).toBe(true)

    const circle = candidatesForMoment(p, p.melody[1]!, {
      topK: 24,
      weights: { ...BASIC_W, taste: 'circle', risk: 0.15, cadenceBias: 'strong' },
    })
    expect(circle.some((c) => c.layer === 'passing' || c.rootPc !== 0)).toBe(true)
  })

  it('moderate cadence seeds only attach at cadence/tag moments', () => {
    const p = createEmptyArrangement('cad-scope')
    p.tonality = 0
    // Mid-phrase notes then a gap into a tag
    p.melody = [
      { id: 'm0', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
      { id: 'm1', midi: 62, startTick: 480, durationTicks: 480, role: 'smn' },
      { id: 'm2', midi: 64, startTick: 960, durationTicks: 480, role: 'pmn' },
      // large gap → cadence/tag at end
      { id: 'm3', midi: 67, startTick: 3000, durationTicks: 480, role: 'pmn' },
      { id: 'm4', midi: 60, startTick: 3480, durationTicks: 960, role: 'pmn' },
    ]
    p.pillars = [
      { id: 'p0', rootPc: 0, startTick: 0, endTick: 4000, source: 'user', confirmed: true },
    ]
    const mod = cadenceSeedsByTick(p, p.melody, 'moderate')
    const strong = cadenceSeedsByTick(p, p.melody, 'strong')
    // Mid ticks (0 / 480 / 960) should not get moderate seeds.
    expect(mod.has(0) || mod.has(480) || mod.has(960)).toBe(false)
    // Strong may still seed mid-phrase circle plans.
    expect(strong.size).toBeGreaterThanOrEqual(mod.size)
  })

  it('onProgress reports increasing fill passes', async () => {
    const { pathOptimize } = await import('./optimize')
    const { createEmptyArrangement } = await import('../types')
    const { createSequentialIdGenerator } = await import(
      '../../../adapters/arranging/persistence/systemServices'
    )
    const p = createEmptyArrangement('prog')
    p.tonality = 0
    p.melody = [
      { id: 'm0', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
      { id: 'm1', midi: 62, startTick: 480, durationTicks: 480, role: 'smn' },
      { id: 'm2', midi: 64, startTick: 960, durationTicks: 480, role: 'pmn' },
    ]
    p.pillars = [
      {
        id: 'p0',
        rootPc: 0,
        startTick: 0,
        endTick: 2000,
        source: 'user',
        confirmed: true,
      },
    ]
    const passes: number[] = []
    await pathOptimize(
      p,
      {
        mode: 'fill',
        scope: { kind: 'whole' },
        maxPasses: 3,
        stopEarly: false,
        skipProbe: true,
        onProgress: (pr) => {
          if (pr.stage === 'fill') passes.push(pr.pass)
        },
      },
      { idGen: createSequentialIdGenerator() },
    )
    expect(passes.length).toBeGreaterThanOrEqual(2)
    expect(passes[0]).toBe(1)
    expect(passes[passes.length - 1]!).toBeGreaterThanOrEqual(passes[0]!)
  })

  it('preferCadenceSeeds at Basic only promotes near-tied seeds', () => {
    const cands = [
      { rootPc: 7, natureId: 'seventh', score: 20 },
      { rootPc: 0, natureId: 'major', score: 10 },
    ]
    const seeds = [{ rootPc: 0, natureId: 'major' }]
    const basic = preferCadenceSeeds(cands, seeds, { risk: 0.2 })
    expect(basic[0]!.natureId).toBe('seventh')
    const risky = preferCadenceSeeds(cands, seeds, { risk: 0.9 })
    // Wider slack at Risky can still promote the weak seed when within absolute window.
    expect(risky.map((c) => c.natureId)).toContain('major')
  })
})
