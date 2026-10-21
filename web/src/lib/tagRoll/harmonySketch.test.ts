/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  BARBERSHOP_CHORDS,
  chordContainsLead,
} from '../../domain/arranging/chords/chords'
import {
  absorbHarmonySpanRemoval,
  authoritativeSketch,
  blockChordMidis,
  carveInsertSketchSpan,
  splitSketchSpanAt,
  mergeDetectIntoSketchHoles,
  pillarsFromHarmonySketch,
  parseHarmonyEntry,
  replaceSketchFromPillars,
  resolveSketchApplyTarget,
  sketchWindowAtPlayhead,
  stepAuthoritativeSketchSpan,
  suggestHarmonyEntries,
  upsertSketchSpan,
} from './harmonySketch'
import {
  buildHarmonyStripRows,
  buildHarmonyStripSegments,
  stacksToDetectHoles,
} from './harmonyStrip'
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

  it('stepAuthoritativeSketchSpan walks locked spans by id, tick, and holes', () => {
    const a = {
      id: 'a',
      startTick: 0,
      endTick: 480,
      rootPc: 0,
      quality: 'major' as const,
      source: 'user' as const,
      locked: true,
    }
    const b = {
      id: 'b',
      startTick: 960,
      endTick: 1440,
      rootPc: 7,
      quality: 'seventh' as const,
      source: 'user' as const,
      locked: true,
    }
    const draft = {
      id: 'draft',
      startTick: 480,
      endTick: 960,
      rootPc: 5,
      quality: 'major' as const,
      source: 'detect' as const,
      locked: false,
    }
    const sketch = [a, draft, b]
    expect(stepAuthoritativeSketchSpan(sketch, { spanId: 'a', tick: 0 }, 1)?.id).toBe('b')
    expect(stepAuthoritativeSketchSpan(sketch, { spanId: 'b', tick: 960 }, -1)?.id).toBe('a')
    expect(stepAuthoritativeSketchSpan(sketch, { spanId: 'a', tick: 0 }, -1)).toBeNull()
    expect(stepAuthoritativeSketchSpan(sketch, { tick: 100 }, 1)?.id).toBe('b')
    expect(stepAuthoritativeSketchSpan(sketch, { tick: 500 }, 1)?.id).toBe('b')
    expect(stepAuthoritativeSketchSpan(sketch, { tick: 500 }, -1)?.id).toBe('a')
    expect(stepAuthoritativeSketchSpan(sketch, { tick: 2000 }, 1)).toBeNull()
    expect(stepAuthoritativeSketchSpan(sketch, { tick: 2000 }, -1)?.id).toBe('b')
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

  it('resolveSketchApplyTarget unions multi-select without a single spanId', () => {
    const hit = resolveSketchApplyTarget({
      playheadTick: 0,
      measureTicks: 1920,
      selectedSpans: [
        { id: 'a', startTick: 0, endTick: 480 },
        { id: 'b', startTick: 480, endTick: 960 },
      ],
    })
    expect(hit).toMatchObject({
      startTick: 0,
      endTick: 960,
      source: 'selectedSketch',
    })
    expect(hit.spanId).toBeUndefined()
  })

  it('resolveSketchApplyTarget prefers selected Sketch, then inspect, then moment', () => {
    expect(
      resolveSketchApplyTarget({
        playheadTick: 0,
        measureTicks: 480,
        selectedSpans: [{ id: 'hs1', startTick: 480, endTick: 960 }],
        inspectRange: { startTick: 0, endTick: 240 },
        momentWindow: { startTick: 100, durationTicks: 50 },
        melodyNote: { startTick: 80, durationTicks: 40 },
      }),
    ).toMatchObject({
      startTick: 480,
      endTick: 960,
      spanId: 'hs1',
      source: 'selectedSketch',
    })
    expect(
      resolveSketchApplyTarget({
        playheadTick: 0,
        measureTicks: 480,
        inspectRange: { startTick: 0, endTick: 240 },
        momentWindow: { startTick: 100, durationTicks: 50 },
      }),
    ).toMatchObject({ startTick: 0, endTick: 240, source: 'inspect' })
    expect(
      resolveSketchApplyTarget({
        playheadTick: 0,
        measureTicks: 480,
        momentWindow: { startTick: 100, durationTicks: 50 },
      }),
    ).toMatchObject({
      startTick: 100,
      durationTicks: 50,
      source: 'moment',
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

describe('splitSketchSpanAt', () => {
  it('splits a locked span into two identical chords', () => {
    const base = upsertSketchSpan([], {
      id: 'home',
      startTick: 0,
      endTick: 1920,
      rootPc: 2,
      quality: 'seventh',
      source: 'user',
      locked: true,
      pillar: true,
    })
    const out = splitSketchSpanAt(base, 'home', 960)
    expect(out).toHaveLength(2)
    expect(out![0]).toMatchObject({
      id: 'home',
      startTick: 0,
      endTick: 960,
      rootPc: 2,
      quality: 'seventh',
      pillar: true,
    })
    expect(out![1]).toMatchObject({
      startTick: 960,
      endTick: 1920,
      rootPc: 2,
      quality: 'seventh',
      pillar: true,
      locked: true,
    })
    expect(out![1]!.id).not.toBe('home')
  })

  it('no-ops at boundaries or for unlocked spans', () => {
    const base = upsertSketchSpan([], {
      id: 'home',
      startTick: 0,
      endTick: 480,
      rootPc: 0,
      quality: 'major',
      source: 'user',
      locked: true,
    })
    expect(splitSketchSpanAt(base, 'home', 0)).toBeNull()
    expect(splitSketchSpanAt(base, 'home', 480)).toBeNull()
    expect(splitSketchSpanAt(base, 'missing', 240)).toBeNull()
  })
})

describe('carveInsertSketchSpan', () => {
  it('splits a covering pillar and inserts a non-pillar passing chord', () => {
    const base = upsertSketchSpan([], {
      id: 'home',
      startTick: 0,
      endTick: 1920,
      rootPc: 0,
      quality: 'major',
      source: 'user',
      locked: true,
      pillar: true,
    })
    const out = carveInsertSketchSpan(base, {
      startTick: 480,
      endTick: 720,
      rootPc: 7,
      quality: 'seventh',
      pillar: false,
      source: 'coach',
    })
    expect(out).toHaveLength(3)
    expect(out[0]).toMatchObject({
      id: 'home',
      startTick: 0,
      endTick: 480,
      rootPc: 0,
      quality: 'major',
      pillar: true,
    })
    expect(out[1]).toMatchObject({
      startTick: 480,
      endTick: 720,
      rootPc: 7,
      quality: 'seventh',
      locked: true,
      pillar: false,
      source: 'coach',
    })
    expect(out[2]).toMatchObject({
      startTick: 720,
      endTick: 1920,
      rootPc: 0,
      quality: 'major',
      pillar: true,
    })
    expect(out[2]!.id).not.toBe('home')
  })
})

describe('absorbHarmonySpanRemoval', () => {
  it('removes the span and leaves neighbors at their original widths', () => {
    let sketch: ReturnType<typeof upsertSketchSpan> = []
    sketch = upsertSketchSpan(sketch, {
      id: 'left',
      startTick: 0,
      endTick: 480,
      rootPc: 0,
      quality: 'major',
      source: 'user',
      locked: true,
    })
    sketch = upsertSketchSpan(sketch, {
      id: 'mid',
      startTick: 480,
      endTick: 960,
      rootPc: 7,
      quality: 'seventh',
      source: 'user',
      locked: true,
    })
    sketch = upsertSketchSpan(sketch, {
      id: 'right',
      startTick: 960,
      endTick: 1440,
      rootPc: 0,
      quality: 'major',
      source: 'user',
      locked: true,
    })
    const out = absorbHarmonySpanRemoval(
      sketch,
      { id: 'mid', startTick: 480, endTick: 960 },
      {
        left: { id: 'left', startTick: 0, endTick: 480, rootPc: 0, quality: 'major' },
        right: { id: 'right', startTick: 960, endTick: 1440, rootPc: 0, quality: 'major' },
      },
    )
    expect(out).toHaveLength(2)
    expect(out.find((s) => s.id === 'left')).toMatchObject({ startTick: 0, endTick: 480 })
    expect(out.find((s) => s.id === 'right')).toMatchObject({ startTick: 960, endTick: 1440 })
    expect(out.some((s) => s.id === 'mid')).toBe(false)
  })

  it('does not invent a neighbor span when deleting a synthetic detect window', () => {
    const out = absorbHarmonySpanRemoval(
      [],
      { id: 'det:0:480:7:seventh', startTick: 0, endTick: 480 },
      {
        right: {
          id: 'det:480:960:0:major',
          startTick: 480,
          endTick: 960,
          rootPc: 0,
          quality: 'major',
        },
      },
    )
    expect(out).toHaveLength(0)
  })
})

describe('harmonyStrip', () => {
  it('stacksToDetectHoles omits unknown natures (no coerce to major)', () => {
    const holes = stacksToDetectHoles(
      [
        {
          id: 'u',
          startTick: 0,
          durationTicks: 480,
          rootPc: 0,
          natureId: 'unknown',
          voicing: '',
          spread: false,
          layer: 'primary',
          scfGroup: null,
          pillarId: null,
          midi: { tenor: 67, lead: 60, bari: 55, bass: 48 },
          ruleTags: [],
        },
        {
          id: 'ok',
          startTick: 480,
          durationTicks: 480,
          rootPc: 0,
          natureId: 'seventh',
          voicing: '',
          spread: false,
          layer: 'primary',
          scfGroup: null,
          pillarId: null,
          midi: { tenor: 70, lead: 60, bari: 58, bass: 48 },
          ruleTags: [],
        },
      ],
      1920,
    )
    expect(holes).toHaveLength(1)
    expect(holes[0]).toMatchObject({ startTick: 480, quality: 'seventh' })
  })

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

  it('Detected Alt applies per sketch-split fragment, not the whole original hole', () => {
    // One detect stack 0–1920; sketch occupies the middle → two Detected halves.
    const cands = new Map([
      [
        0,
        [
          { rootPc: 7, natureId: 'seventh', label: 'G7' },
          { rootPc: 0, natureId: 'major', label: 'C' },
          { rootPc: 5, natureId: 'major', label: 'F' },
        ],
      ],
    ])
    const rows = buildHarmonyStripRows({
      sketch: [
        {
          id: 'hs1',
          startTick: 480,
          endTick: 960,
          rootPc: 2,
          quality: 'm7',
          source: 'user',
          locked: true,
        },
      ],
      detectStacks: [
        {
          id: 's1',
          startTick: 0,
          durationTicks: 1920,
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
      lengthTicks: 1920,
      nameCandidatesByTick: cands,
      // Only the right half (starts at 960) takes the 2nd pick.
      detectAltIndexByStartTick: { 960: 1 },
      resolveCandidateTick: () => 0,
    })
    const left = rows.detect.find((s) => s.startTick === 0)
    const right = rows.detect.find((s) => s.startTick === 960)
    expect(left).toBeTruthy()
    expect(right).toBeTruthy()
    expect(left!.rootPc).toBe(7)
    expect(left!.name).toMatch(/G7/)
    expect(right!.rootPc).toBe(0)
    expect(right!.name).toMatch(/^C/)
  })

  it('parseHarmonyEntry treats empty / dash as blank placeholder', () => {
    expect(parseHarmonyEntry('', { tonality: 0, mode: 'major', preferFlats: false, entryMode: 'name' })).toEqual({
      rootPc: 0,
      quality: 'blank',
    })
    expect(parseHarmonyEntry('—', { tonality: 7, mode: 'major', preferFlats: false, entryMode: 'name' })).toEqual({
      rootPc: 7,
      quality: 'blank',
    })
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

  it('empty suggestHarmonyEntries prefers chords containing the melody note', () => {
    // C4 (midi 60) → C / Am / F / … rather than the generic C-major starter list
    const sug = suggestHarmonyEntries('', {
      tonality: 0,
      mode: 'major',
      preferFlats: false,
      entryMode: 'name',
      leadMidi: 60,
    })
    expect(sug.length).toBeGreaterThan(8)
    expect(sug[0]?.quality).toBe('blank')
    expect(sug.some((s) => s.rootPc === 0 && s.quality === 'major')).toBe(true)
    const sounding = sug.filter((s) => s.quality !== 'blank')
    expect(sounding.every((s) => {
      const chord = BARBERSHOP_CHORDS.find((c) => c.id === s.quality)
      if (!chord) return false
      return chordContainsLead(chord, s.rootPc, 60)
    })).toBe(true)
  })

  it('empty suggestHarmonyEntries without melody lists in-key chords', () => {
    const sug = suggestHarmonyEntries('', {
      tonality: 0,
      mode: 'major',
      preferFlats: false,
      entryMode: 'name',
      leadMidi: null,
    })
    expect(sug.length).toBeGreaterThan(8)
    expect(sug[0]?.quality).toBe('blank')
    // Diatonic C major roots only (no ♯I / ♭II, etc.) after the blank row.
    const diatonic = new Set([0, 2, 4, 5, 7, 9, 11])
    expect(sug.slice(1).every((s) => diatonic.has(s.rootPc))).toBe(true)
    expect(sug.some((s) => s.rootPc === 0 && s.quality === 'major')).toBe(true)
    expect(sug.some((s) => s.rootPc === 7 && s.quality === 'seventh')).toBe(true)
  })
})
