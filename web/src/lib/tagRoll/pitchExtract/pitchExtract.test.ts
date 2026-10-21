/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { buildTagRollProjectFromPitchStacks } from './buildProject'
import { segmentPitchStacks, type PartSeries } from './segmentStacks'
import { parseTonalityFromKey } from './tonality'
import { hzToMidi, resampleLinear } from './yin'

describe('parseTonalityFromKey', () => {
  it('parses Bb Major / Major:Bb', () => {
    expect(parseTonalityFromKey('Major:Bb', null).tonality).toBe(10)
    expect(parseTonalityFromKey(null, 'Bb Major').tonality).toBe(10)
    expect(parseTonalityFromKey('Minor:A', null).mode).toBe('minor')
  })
})

describe('segmentPitchStacks', () => {
  it('emits a held I major stack when all four voices sustain', () => {
    // Bb major: Bb2 F3 Bb3 D4 — hold ~0.5s at hop 512/22050
    const frames = 30
    const fill = (midi: number) => Int16Array.from({ length: frames }, () => midi)
    const series: PartSeries = {
      bass: fill(46),
      bari: fill(53),
      lead: fill(58),
      tenor: fill(62),
    }
    const stacks = segmentPitchStacks(series, 10)
    expect(stacks.length).toBeGreaterThanOrEqual(1)
    const s = stacks[0]!
    expect(s.natureId).toBe('major')
    expect(s.rootPc).toBe(10)
    expect(s.midi.lead).toBeDefined()
  })
})

describe('buildTagRollProjectFromPitchStacks', () => {
  it('creates notes + detect sketch for confident stacks', () => {
    const p = buildTagRollProjectFromPitchStacks({
      title: 'Test Tag',
      tagId: 42,
      tonality: 10,
      mode: 'major',
      preferFlats: true,
      stacks: [
        {
          t0: 0,
          t1: 1,
          midi: { bass: 46, bari: 53, lead: 58, tenor: 62 },
          natureId: 'major',
          rootPc: 10,
          confidence: 1,
          pcs: [10, 2, 5],
        },
        {
          t0: 1,
          t1: 2,
          midi: { bass: 41, bari: 53, lead: 57, tenor: 60 },
          natureId: 'seventh',
          rootPc: 5,
          confidence: 0.9,
          pcs: [5, 9, 0, 3],
        },
      ],
    })
    expect(p.notes.length).toBe(8)
    expect(p.harmonySketch.length).toBe(2)
    expect(p.tonality).toBe(10)
    expect(p.title).toBe('Test Tag')
  })
})

describe('yin helpers', () => {
  it('hzToMidi / resample sanity', () => {
    expect(hzToMidi(440)).toBeCloseTo(69, 5)
    const src = Float32Array.from({ length: 100 }, (_, i) => Math.sin(i))
    const out = resampleLinear(src, 44_100, 22_050)
    expect(out.length).toBe(50)
  })
})
