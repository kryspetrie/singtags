/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  authoritativeSketch,
  blockChordMidis,
  mergeDetectIntoSketchHoles,
  pillarsFromHarmonySketch,
  parseHarmonyEntry,
  replaceSketchFromPillars,
  sketchWindowAtPlayhead,
  suggestHarmonyEntries,
  upsertSketchSpan,
} from './harmonySketch'
import { buildHarmonyStripRows, buildHarmonyStripSegments } from './harmonyStrip'
import type { ChordStack } from '../../domain/arranging/types'

describe('harmonySketch', () => {
  it('parseHarmonyEntry reads chord names and roman numerals', () => {
    expect(parseHarmonyEntry('G7', { tonality: 0, mode: 'major', preferFlats: false, entryMode: 'name' })).toEqual({
      rootPc: 7,
      quality: 'seventh',
    })
    expect(parseHarmonyEntry('V7', { tonality: 0, mode: 'major', preferFlats: false, entryMode: 'roman' })).toEqual({
      rootPc: 7,
      quality: 'seventh',
    })
    expect(parseHarmonyEntry('ii', { tonality: 0, mode: 'major', preferFlats: false, entryMode: 'roman' })).toEqual({
      rootPc: 2,
      quality: 'minor',
    })
    expect(parseHarmonyEntry('vii°7', { tonality: 0, mode: 'major', preferFlats: false, entryMode: 'roman' })).toEqual({
      rootPc: 11,
      quality: 'dim7',
    })
    expect(parseHarmonyEntry('viiø7', { tonality: 0, mode: 'major', preferFlats: false, entryMode: 'roman' })).toEqual({
      rootPc: 11,
      quality: 'half-dim',
    })
    expect(parseHarmonyEntry('viidim7', { tonality: 0, mode: 'major', preferFlats: false, entryMode: 'roman' })).toEqual({
      rootPc: 11,
      quality: 'dim7',
    })
    expect(parseHarmonyEntry('Gsus', { tonality: 0, mode: 'major', preferFlats: false, entryMode: 'name' })).toBeNull()
  })

  it('authoritativeSketch is locked-only; unconfirmed pillars do not write Declared', () => {
    const unlockedCoach = {
      id: 'hs_draft',
      startTick: 0,
      endTick: 480,
      rootPc: 0,
      quality: 'major' as const,
      source: 'coach' as const,
      locked: false,
    }
    expect(authoritativeSketch([unlockedCoach])).toEqual([])
    const withDraftPillar = replaceSketchFromPillars([], [
      { id: 'pil_d', rootPc: 0, startTick: 0, endTick: 480, confirmed: false },
      { id: 'pil_l', rootPc: 7, startTick: 480, endTick: 960, confirmed: true },
    ])
    expect(withDraftPillar).toHaveLength(1)
    expect(withDraftPillar[0]).toMatchObject({ rootPc: 7, locked: true })
  })

  it('sketchWindowAtPlayhead prefers inspect, then melody, then +1 measure', () => {
    expect(
      sketchWindowAtPlayhead({
        playheadTick: 100,
        measureTicks: 480,
        inspectRange: { startTick: 0, endTick: 240 },
      }),
    ).toEqual({ startTick: 0, endTick: 240 })
    expect(
      sketchWindowAtPlayhead({
        playheadTick: 100,
        measureTicks: 480,
        melodyNote: { startTick: 80, durationTicks: 40 },
      }),
    ).toEqual({ startTick: 80, endTick: 120 })
    expect(sketchWindowAtPlayhead({ playheadTick: 100, measureTicks: 480 })).toEqual({
      startTick: 0,
      endTick: 480,
    })
    expect(sketchWindowAtPlayhead({ playheadTick: 500, measureTicks: 480 })).toEqual({
      startTick: 480,
      endTick: 960,
    })
  })

  it('mergeDetectIntoSketchHoles never overwrites locked sketch', () => {
    const sketch = [
      {
        id: 'hs1',
        startTick: 0,
        endTick: 960,
        rootPc: 0,
        quality: 'major' as const,
        source: 'user' as const,
        locked: true,
      },
    ]
    const merged = mergeDetectIntoSketchHoles(sketch, [
      { startTick: 0, endTick: 1920, rootPc: 7, quality: 'seventh' },
    ])
    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({ rootPc: 0, locked: true, source: 'user' })
    expect(merged[1]).toMatchObject({ startTick: 960, rootPc: 7, source: 'detect', locked: false })
  })

  it('blockChordMidis returns catalog tones for major, half-dim, and dim7', () => {
    const maj = blockChordMidis({ rootPc: 0, quality: 'major', leadMidi: 72 })
    expect(maj.length).toBeGreaterThanOrEqual(3)
    expect(maj).toContain(72)

    const hdim = blockChordMidis({ rootPc: 0, quality: 'half-dim', leadMidi: 72 })
    const hdimPcs = [...new Set(hdim.map((m) => ((m % 12) + 12) % 12))]
    // Cø7 = C E♭ G♭ B♭ → 0, 3, 6, 10
    expect(hdimPcs).toEqual(expect.arrayContaining([0, 3, 6, 10]))

    const dim7 = blockChordMidis({ rootPc: 0, quality: 'dim7', leadMidi: 72 })
    const dim7Pcs = [...new Set(dim7.map((m) => ((m % 12) + 12) % 12))]
    // Cdim7 = C E♭ G♭ B𝄫 → 0, 3, 6, 9
    expect(dim7Pcs).toEqual(expect.arrayContaining([0, 3, 6, 9]))
  })

  it('pillarsFromHarmonySketch and replaceSketchFromPillars drop orphans and keep quality', () => {
    let sketch = upsertSketchSpan([], {
      startTick: 0,
      endTick: 480,
      rootPc: 7,
      quality: 'seventh',
      source: 'user',
      locked: true,
    })
    sketch = upsertSketchSpan(sketch, {
      startTick: 480,
      endTick: 960,
      rootPc: 0,
      quality: 'major',
      source: 'user',
      locked: true,
    })
    const pillars = pillarsFromHarmonySketch(sketch, (p) => `${p}_1`)
    expect(pillars).toHaveLength(2)
    // Delete second pillar → replace drops that span
    sketch = replaceSketchFromPillars(sketch, [
      { id: 'pil_keep', rootPc: 7, startTick: 0, endTick: 480, confirmed: true },
    ])
    expect(sketch).toHaveLength(1)
    expect(sketch[0]).toMatchObject({ rootPc: 7, quality: 'seventh', locked: true })
  })
})

describe('harmonyStrip', () => {
  it('buildHarmonyStripSegments prefers sketch over detect', () => {
    const stacks: ChordStack[] = [
      {
        id: 's1',
        startTick: 0,
        durationTicks: 960,
        rootPc: 7,
        natureId: 'seventh',
        voicing: '',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: { tenor: 67, lead: 72, bari: 62, bass: 55 },
        ruleTags: [],
      },
    ]
    const segs = buildHarmonyStripSegments({
      sketch: [
        {
          id: 'hs1',
          startTick: 0,
          endTick: 480,
          rootPc: 0,
          quality: 'major',
          source: 'user',
          locked: true,
        },
      ],
      detectStacks: stacks,
      tonality: 0,
      tonalityMode: 'major',
      preferFlats: false,
      lengthTicks: 1920,
    })
    expect(segs[0]).toMatchObject({ rootPc: 0, locked: true, detect: false })
    expect(segs.some((s) => s.detect && s.rootPc === 7)).toBe(true)
  })

  it('buildHarmonyStripRows does not extend detect across empty bars', () => {
    const rows = buildHarmonyStripRows({
      sketch: [],
      detectStacks: [
        {
          id: 's1',
          startTick: 0,
          durationTicks: 480,
          rootPc: 0,
          natureId: 'major',
          voicing: '',
          spread: false,
          layer: 'primary',
          scfGroup: null,
          pillarId: null,
          midi: null,
          ruleTags: [],
        },
        {
          id: 's2',
          startTick: 1920,
          durationTicks: 480,
          rootPc: 7,
          natureId: 'seventh',
          voicing: '',
          spread: false,
          layer: 'primary',
          scfGroup: null,
          pillarId: null,
          midi: null,
          ruleTags: [],
        },
      ],
      tonality: 0,
      preferFlats: false,
      lengthTicks: 3840,
      notes: [
        { startTick: 0, durationTicks: 480 },
        { startTick: 1920, durationTicks: 480 },
      ],
    })
    expect(rows.detect).toHaveLength(2)
    expect(rows.detect[0]!.endTick).toBe(480)
    expect(rows.detect[1]!.startTick).toBe(1920)
    // No detect painted through the silent gap 480–1920
    expect(rows.detect.every((s) => s.endTick <= 480 || s.startTick >= 1920)).toBe(true)
  })

  it('buildHarmonyStripRows separates declared and detect', () => {
    const rows = buildHarmonyStripRows({
      sketch: [
        {
          id: 'hs1',
          startTick: 0,
          endTick: 480,
          rootPc: 0,
          quality: 'major',
          source: 'user',
          locked: true,
        },
      ],
      detectStacks: [
        {
          id: 's1',
          startTick: 0,
          durationTicks: 960,
          rootPc: 7,
          natureId: 'seventh',
          voicing: '',
          spread: false,
          layer: 'primary',
          scfGroup: null,
          pillarId: null,
          midi: { tenor: 67, lead: 72, bari: 62, bass: 55 },
          ruleTags: [],
        },
      ],
      tonality: 0,
      preferFlats: false,
      lengthTicks: 1920,
    })
    expect(rows.declared).toHaveLength(1)
    expect(rows.declared[0]!.detect).toBe(false)
    expect(rows.detect.every((s) => s.detect)).toBe(true)
    expect(rows.detect.some((s) => s.rootPc === 7)).toBe(true)
  })

  it('suggestHarmonyEntries offers symbol-friendly completions', () => {
    const sug = suggestHarmonyEntries('Bb', {
      tonality: 0,
      mode: 'major',
      preferFlats: true,
      entryMode: 'name',
    })
    expect(sug.length).toBeGreaterThan(0)
    expect(sug.some((s) => s.rootPc === 10)).toBe(true)
  })
})
