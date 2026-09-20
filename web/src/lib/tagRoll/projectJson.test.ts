import { describe, expect, it } from 'vitest'
import { createEmptyTagRollProject } from './normalize'
import {
  parseTagRollProjectJson,
  parseTagRollProjectJsonText,
  serializeTagRollProjectJson,
  tagRollJsonFilename,
} from './projectJson'
import { TAG_ROLL_PPQ, TAG_ROLL_SCHEMA } from './types'
import lillyMarleneV2 from './defaultProjects/lillyMarleneV2.json'

describe('projectJson', () => {
  it('names downloads from the title', () => {
    expect(tagRollJsonFilename({ title: 'Lilly Marlene (v2)' })).toBe('Lilly_Marlene_v2.json')
  })

  it('round-trips a project and assigns a fresh id on import', () => {
    const p = createEmptyTagRollProject({ title: 'Round trip' })
    p.notes.push({
      id: 'n1',
      partId: p.parts[0]!.id,
      midi: 60,
      startTick: 0,
      durationTicks: 480,
    })
    const raw = serializeTagRollProjectJson(p)
    expect(raw.schema).toBe(TAG_ROLL_SCHEMA)
    expect(raw.localEntryId).toBeNull()

    const parsed = parseTagRollProjectJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.project.id).not.toBe(p.id)
    expect(parsed.project.title).toBe('Round trip')
    expect(parsed.project.notes).toHaveLength(1)
  })

  it('preserves blow pitch, tonality, tempo map, and expressions on round-trip', () => {
    const p = createEmptyTagRollProject({ title: 'Pitch Export' })
    p.blowPitchEnabled = true
    p.pitchPipeSoundId = 'reed'
    p.tonality = 5
    p.bpm = 96
    p.tempoMarkers = [
      { id: 't0', tick: 0, bpm: 96 },
      { id: 't1', tick: TAG_ROLL_PPQ * 4, bpm: 112 },
    ]
    p.expressions = [
      {
        id: 'f1',
        kind: 'fermata',
        tick: TAG_ROLL_PPQ,
        holdTicks: TAG_ROLL_PPQ / 2,
        gapTicks: 0,
      },
    ]
    p.notes = [
      {
        id: 'n1',
        partId: p.parts[0]!.id,
        midi: 62,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
        lyric: 'Hey',
      },
    ]
    const parsed = parseTagRollProjectJson(serializeTagRollProjectJson(p))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.project.blowPitchEnabled).toBe(true)
    expect(parsed.project.pitchPipeSoundId).toBe('reed')
    expect(parsed.project.tonality).toBe(5)
    expect(parsed.project.tempoMarkers).toHaveLength(2)
    expect(parsed.project.expressions).toHaveLength(1)
    expect(parsed.project.notes[0]?.lyric).toBe('Hey')
  })

  it('accepts the checked-in Lilly Marlene seed', () => {
    const parsed = parseTagRollProjectJson(lillyMarleneV2)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.project.title).toBe('Lilly Marlene (v2)')
    expect(parsed.project.notes.length).toBeGreaterThan(0)
  })

  it('rejects bad JSON text and wrong schema', () => {
    expect(parseTagRollProjectJsonText('{').ok).toBe(false)
    expect(parseTagRollProjectJson({ schema: 'nope' }).ok).toBe(false)
  })
})
