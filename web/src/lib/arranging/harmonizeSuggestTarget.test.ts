import { describe, expect, it } from 'vitest'
import { createSequentialIdGenerator } from '../../adapters/arranging/persistence/systemServices'
import { tagStudioToArrangement } from '../../application/arranging/syncTagRoll'
import { normalizeTagRollProject } from '../tagRoll/normalize'
import lillyMarleneV2 from '../tagRoll/defaultProjects/lillyMarleneV2.json'
import {
  harmonizeSuggestAnchorTick,
  listHarmonizeSuggestMoments,
  resolveHarmonizeSuggestMoment,
  resolveHarmonizeSuggestTarget,
  stepHarmonizeSuggestMoment,
  suggestTargetFromMoment,
} from './harmonizeSuggestTarget'

const ts44 = { numerator: 4, denominator: 4 }

describe('harmonizeSuggestTarget', () => {
  it('anchor is measure start (not melody onset); inspect range wins', () => {
    // Mid-measure playhead → start of that measure (ppq 480 → 1920 ticks/measure).
    expect(
      harmonizeSuggestAnchorTick({
        playheadTick: 2500,
        timeSignature: ts44,
        ppq: 480,
      }),
    ).toBe(1920)
    // Melody onset mid-measure must not win over the measure grid.
    expect(
      harmonizeSuggestAnchorTick({
        playheadTick: 1680,
        timeSignature: ts44,
        ppq: 480,
      }),
    ).toBe(0)
    // Ruler / chord-cursor selection pins the Suggest column.
    expect(
      harmonizeSuggestAnchorTick({
        playheadTick: 2500,
        timeSignature: ts44,
        ppq: 480,
        inspectRange: { startTick: 1920, endTick: 3840 },
      }),
    ).toBe(1920)
  })

  it('suggestTargetFromMoment pins startTick to the timeline anchor', () => {
    const moment = {
      id: 'm',
      startTick: 1680,
      durationTicks: 1200,
      leadMidi: 60,
      role: 'melody' as const,
      heldLead: true,
      leadNoteId: 'lead1',
    }
    const target = suggestTargetFromMoment(moment, 1920)
    expect(target.startTick).toBe(1920)
    expect(target.durationTicks).toBe(960) // through moment end 2880
    expect(target.midi).toBe(60)
  })

  it('Lilly Marlene: FACF stack onset (not Lead attack) is the Suggest target', () => {
    const tag = normalizeTagRollProject(lillyMarleneV2)
    expect(tag).toBeTruthy()
    const arr = tagStudioToArrangement(tag!, createSequentialIdGenerator(1))
    // Lead “lene” C overlaps previous Lead; TBB F–A–C–F enters at 2880 under held C.
    const atFacf = resolveHarmonizeSuggestMoment({
      tag: tag!,
      melody: arr.melody,
      tick: 2880,
    })
    expect(atFacf?.startTick).toBe(2880)
    expect(atFacf?.heldLead).toBe(true)
    expect(atFacf!.leadMidi % 12).toBe(0) // C

    // Ranking at Lead attack must NOT equal the FACF stack moment.
    const atLeadRegion = resolveHarmonizeSuggestMoment({
      tag: tag!,
      melody: arr.melody,
      tick: 1680,
    })
    expect(atLeadRegion?.startTick).not.toBe(2880)

    const target = resolveHarmonizeSuggestTarget({
      tag: tag!,
      melody: arr.melody,
      tick: 2880,
    })
    expect(target?.startTick).toBe(2880)
    expect(target!.midi % 12).toBe(0)

    // Measure selection (1920–3840): target starts at measure, not Lead onset 1680.
    const measureAnchor = 1920
    const covering = resolveHarmonizeSuggestMoment({
      tag: tag!,
      melody: arr.melody,
      tick: measureAnchor,
    })
    expect(covering).toBeTruthy()
    const atMeasure = suggestTargetFromMoment(covering!, measureAnchor)
    expect(atMeasure.startTick).toBe(1920)
    expect(atMeasure.startTick).not.toBe(1680)

    const moments = listHarmonizeSuggestMoments({ tag: tag!, melody: arr.melody })
    const facf = moments.find((m) => m.startTick === 2880)
    expect(facf).toBeTruthy()
    const next = stepHarmonizeSuggestMoment(moments, 2880, 1)
    expect(next?.startTick).toBeGreaterThan(2880)
    const prev = stepHarmonizeSuggestMoment(moments, 2880, -1)
    expect(prev?.startTick).toBeLessThan(2880)
  })
})
