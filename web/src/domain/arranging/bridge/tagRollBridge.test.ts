/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { arrangementToTagRoll, tagRollToArrangement } from './tagRollBridge'
import { createEmptyArrangement, type ArrangementProject } from '../types'
import { BARBERSHOP_CHORDS, placeVoicing } from '../chords'

function seqId() {
  let n = 0
  return { next: (p: string) => `${p}_${++n}` }
}

function fixture(): ArrangementProject {
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === 'seventh')!
  const midi = placeVoicing({
    chord,
    rootPc: 7,
    leadMidi: 62,
    voicing: '5317',
  })!
  return {
    ...createEmptyArrangement('Bridge Song', { id: 'arr_1', now: 1000 }),
    preferFlats: true,
    bpm: 112,
    tonality: 0,
    melody: [
      {
        id: 'mel_1',
        midi: 62,
        startTick: 0,
        durationTicks: 480,
        role: 'pmn',
        lyric: 'Oh',
      },
    ],
    stacks: [
      {
        id: 'stk_1',
        startTick: 0,
        durationTicks: 480,
        rootPc: 7,
        natureId: 'seventh',
        voicing: '5317',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi,
        ruleTags: [],
      },
    ],
  }
}

describe('tagRollBridge', () => {
  it('round-trips TTBB stacks and lyrics through TagRoll notes', () => {
    const gen = seqId()
    const arr = fixture()
    const tag = arrangementToTagRoll(arr, gen)
    expect(tag.schema).toBe('singtags.tagRoll.project.v1')
    expect(tag.ppq).toBe(480)
    expect(tag.parts.map((p) => p.name)).toEqual(['Tenor', 'Lead', 'Bari', 'Bass'])
    expect(tag.notes).toHaveLength(4)
    const lead = tag.parts.find((p) => p.name === 'Lead')!
    expect(tag.notes.find((n) => n.partId === lead.id)?.lyric).toBe('Oh')

    const back = tagRollToArrangement(tag, seqId())
    expect(back.melody).toHaveLength(1)
    expect(back.melody[0]!.midi).toBe(62)
    expect(back.melody[0]!.lyric).toBe('Oh')
    expect(back.stacks).toHaveLength(1)
    expect(back.stacks[0]!.midi?.lead).toBe(62)
    expect(back.stacks[0]!.midi?.bass).toBe(arr.stacks[0]!.midi!.bass)
    expect(back.bpm).toBe(112)
    expect(back.preferFlats).toBe(true)
  })

  it('preserves held lead posts when exporting stacks at sub-spans', () => {
    const arr = createEmptyArrangement('Post', { id: 'arr_3', now: 1 })
    arr.melody = [{ id: 'm1', midi: 67, startTick: 0, durationTicks: 1920, role: 'pmn' }]
    arr.stacks = [
      {
        id: 's1',
        startTick: 0,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'major',
        voicing: '1513',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: { bass: 48, bari: 55, lead: 67, tenor: 72 },
        ruleTags: [],
      },
      {
        id: 's2',
        startTick: 480,
        durationTicks: 480,
        rootPc: 7,
        natureId: 'seventh',
        voicing: '1513',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: { bass: 50, bari: 57, lead: 67, tenor: 74 },
        ruleTags: [],
      },
    ]
    const tag = arrangementToTagRoll(arr, seqId())
    const lead = tag.parts.find((p) => p.name === 'Lead')!
    const leadNotes = tag.notes.filter((n) => n.partId === lead.id)
    expect(leadNotes).toHaveLength(1)
    expect(leadNotes[0]).toMatchObject({ midi: 67, startTick: 0, durationTicks: 1920 })
    const back = tagRollToArrangement(tag, seqId())
    expect(back.stacks.length).toBeGreaterThanOrEqual(2)
    expect(back.melody[0]!.durationTicks).toBe(1920)
  })
})
