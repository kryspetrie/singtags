import { describe, expect, it } from 'vitest'
import {
  applyGoldOverrides,
  buildGoldFromChart,
  labelOnset,
  listAmbiguousOnsets,
  summarizeGold,
  type MixedGoldChartView,
} from './buildFromSeed'

function chartCMajor(): MixedGoldChartView {
  // C major: Lead C4, Tenor E4, Bari G3, Bass C3
  return {
    id: 'seed-polecat-mixed-90001',
    tonality: 0,
    tonalityMode: 'major',
    preferFlats: false,
    notes: [
      { partName: 'Lead', midi: 60, startTick: 0, durationTicks: 480 },
      { partName: 'Tenor', midi: 64, startTick: 0, durationTicks: 480 },
      { partName: 'Bari', midi: 55, startTick: 0, durationTicks: 480 },
      { partName: 'Bass', midi: 48, startTick: 0, durationTicks: 480 },
      { partName: 'Lead', midi: 62, startTick: 480, durationTicks: 480 },
      { partName: 'Bass', midi: 49, startTick: 480, durationTicks: 480 }, // C# — weak/ambiguous
    ],
  }
}

describe('labelOnset / buildGoldFromChart', () => {
  it('labels a full C major stack and auto-locks when unambiguous', () => {
    const labeled = labelOnset({
      leadMidi: 60,
      midi: { tenor: 64, bari: 55, bass: 48 },
      startTick: 0,
      endTick: 480,
      tonality: 0,
      mode: 'major',
      profile: 'sai11',
      preferFlats: false,
    })
    expect(labeled).toBeTruthy()
    expect(labeled!.natureId).toMatch(/major|add9|sixth/)
    expect(labeled!.rootPc).toBe(0)
    expect(labeled!.labelSource).toBe('auto-identify')
  })

  it('builds gold from chart and applies overrides to lock ambiguous onsets', () => {
    const gold = buildGoldFromChart({ chart: chartCMajor(), tagId: 90001 })
    expect(gold.schema).toBe('mixedChartGold.v1')
    expect(gold.onsets.length).toBeGreaterThanOrEqual(1)
    expect(gold.seedId).toBe('seed-polecat-mixed-90001')

    const unlocked = listAmbiguousOnsets(gold)
    const next = applyGoldOverrides(gold, [
      {
        startTick: unlocked[0]?.startTick ?? gold.onsets[0]!.startTick,
        rootPc: 0,
        natureId: 'major',
        labelSource: 'manual-alt',
      },
    ])
    expect(next.onsets.some((o) => o.labelSource === 'manual-alt' && o.locked)).toBe(true)
    const sum = summarizeGold(next)
    expect(sum.locked).toBeGreaterThanOrEqual(1)
  })
})
