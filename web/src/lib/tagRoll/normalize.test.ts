/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import {
  createEmptyTagRollProject,
  midiToY,
  normalizeTagRollProject,
  pxToTicks,
  ticksToPx,
  yToMidi,
} from './normalize'
import {
  TAG_ROLL_DEFAULT_BPM,
  TAG_ROLL_MIDI_MAX,
  TAG_ROLL_PPQ,
  TAG_ROLL_SCHEMA,
} from './types'

describe('tagRoll normalize', () => {
  it('creates an empty project with TTBB parts and lead active', () => {
    const p = createEmptyTagRollProject({ title: '  Test  ' })
    expect(p.schema).toBe(TAG_ROLL_SCHEMA)
    expect(p.title).toBe('Test')
    expect(p.bpm).toBe(TAG_ROLL_DEFAULT_BPM)
    expect(p.ppq).toBe(TAG_ROLL_PPQ)
    expect(p.parts).toHaveLength(4)
    expect(p.parts.map((x) => x.name)).toEqual(['Tenor', 'Lead', 'Bari', 'Bass'])
    expect(p.notes).toEqual([])
    expect(p.view.activePartId).toBe(p.parts.find((x) => x.name === 'Lead')!.id)
  })

  it('round-trips through normalize', () => {
    const p = createEmptyTagRollProject()
    p.notes.push({
      id: 'n1',
      partId: p.parts[1]!.id,
      midi: 60,
      startTick: 0,
      durationTicks: TAG_ROLL_PPQ,
      lyric: 'Hi',
    })
    const n = normalizeTagRollProject(JSON.parse(JSON.stringify(p)))
    expect(n).not.toBeNull()
    expect(n!.notes).toHaveLength(1)
    expect(n!.notes[0]!.lyric).toBe('Hi')
    expect(n!.notes[0]!.midi).toBe(60)
  })

  it('drops notes for unknown parts', () => {
    const p = createEmptyTagRollProject()
    const raw = {
      ...p,
      notes: [{ id: 'x', partId: 'missing', midi: 60, startTick: 0, durationTicks: 120 }],
    }
    const n = normalizeTagRollProject(raw)
    expect(n!.notes).toHaveLength(0)
  })

  it('converts ticks and midi to pixels consistently', () => {
    expect(ticksToPx(TAG_ROLL_PPQ, 28)).toBe(28)
    expect(pxToTicks(28, 28)).toBe(TAG_ROLL_PPQ)
    expect(midiToY(TAG_ROLL_MIDI_MAX, 14)).toBe(0)
    expect(yToMidi(0, 14)).toBe(TAG_ROLL_MIDI_MAX)
    expect(yToMidi(14, 14)).toBe(TAG_ROLL_MIDI_MAX - 1)
  })
})
