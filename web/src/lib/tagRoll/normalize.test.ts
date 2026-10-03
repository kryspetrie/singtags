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
    expect(p.id).toMatch(/^[0-9A-Za-z]{10}$/)
    expect(p.id).not.toMatch(/uuid|-/i)
    expect(p.bpm).toBe(TAG_ROLL_DEFAULT_BPM)
    expect(p.ppq).toBe(TAG_ROLL_PPQ)
    expect(p.parts).toHaveLength(4)
    expect(p.parts.map((x) => x.name)).toEqual(['Tenor', 'Lead', 'Bari', 'Bass'])
    expect(p.notes).toEqual([])
    expect(p.view.activePartId).toBe(p.parts.find((x) => x.name === 'Lead')!.id)
    expect(p.mix.filter((m) => p.parts.some((x) => x.id === m.partId))).toHaveLength(4)
    expect(p.mix.length).toBeGreaterThanOrEqual(4)
    const leadMix = p.mix.find((m) => m.partId === p.parts.find((x) => x.name === 'Lead')!.id)!
    const tenorMix = p.mix.find((m) => m.partId === p.parts.find((x) => x.name === 'Tenor')!.id)!
    expect(tenorMix.pan).toBeCloseTo(-0.6)
    expect(leadMix.pan).toBeCloseTo(-0.2)
    expect(leadMix.volume).toBeGreaterThan(tenorMix.volume)
    expect(p.view.focusActivePart).toBe(false)
    expect(p.view.scaleHighlight).toBe(true)
    expect(p.view.roleDisplay).toBe('off')
    expect(p.view.showNoteNames).toBe(true)
    expect(p.view.showNoteLyrics).toBe(true)
    expect(p.clefFamily).toBe('ttbb')
    expect(p.view.scoreSurface).toBe('roll')
  })

  it('normalizes clefFamily and defaults missing to ttbb', () => {
    const p = createEmptyTagRollProject()
    const ssaa = normalizeTagRollProject({ ...p, clefFamily: 'ssaa' })
    expect(ssaa!.clefFamily).toBe('ssaa')
    const legacy = { ...p } as Record<string, unknown>
    delete legacy.clefFamily
    expect(normalizeTagRollProject(legacy)!.clefFamily).toBe('ttbb')
  })

  it('normalizes scoreSurface and defaults to roll', () => {
    const p = createEmptyTagRollProject()
    expect(normalizeTagRollProject({ ...p, view: { ...p.view, scoreSurface: 'sheet' } })!.view.scoreSurface).toBe(
      'sheet',
    )
    const legacy = { ...p, view: { ...p.view } } as { view: Record<string, unknown> }
    delete legacy.view.scoreSurface
    expect(normalizeTagRollProject(legacy)!.view.scoreSurface).toBe('roll')
  })

  it('normalizes sheet metadata and sheetLayout', () => {
    const p = createEmptyTagRollProject()
    expect(p.subtitle).toBe('')
    expect(p.composer).toBe('')
    expect(p.arranger).toBe('')
    expect(p.sheetNote).toBe('')
    expect(p.view.sheetLayout).toBe('continuous')
    expect(p.view.sheetMeasureSizing).toBe('equal')
    expect(p.view.sheetNoteColors).toBe(true)
    expect(p.view.sheetStaveGap).toBe('tight')
    expect(p.view.sheetMeasureScale).toBe(1)
    expect(p.view.sheetNoteSpacing).toBe(1)
    expect(p.view.sheetBeatStretch).toBe(1)
    expect(p.view.sheetStaveGapFine).toBe(0.85)
    expect(p.view.sheetSystemGap).toBe(0.65)
    expect(p.view.sheetMarginLeftIn).toBe(0.3)
    expect(p.view.sheetEngravingScale).toBe(0.9)
    expect(p.view.sheetPlaybackHighlight).toBe(true)
    expect(p.view.sheetLyricOffsets).toEqual({})
    expect(p.view.sheetPageWidthIn).toBe(8.5)
    const leadId = p.parts.find((part) => part.name === 'Lead')!.id
    const n = normalizeTagRollProject({
      ...p,
      subtitle: '  Sub  ',
      composer: 'C',
      arranger: 'A',
      sheetNote: 'Foot',
      view: {
        ...p.view,
        sheetLayout: 'page',
        sheetMeasureSizing: 'dynamic',
        sheetNoteColors: false,
        sheetStaveGap: 'wide',
        sheetMeasureScale: 1.25,
        sheetNoteSpacing: 1.4,
        sheetLyricOffsets: { [leadId]: 2.5, gone: 3, bad: 'x' },
      },
    })
    expect(n!.subtitle).toBe('Sub')
    expect(n!.composer).toBe('C')
    expect(n!.arranger).toBe('A')
    expect(n!.sheetNote).toBe('Foot')
    expect(n!.view.sheetLayout).toBe('page')
    expect(n!.view.sheetMeasureSizing).toBe('dynamic')
    expect(n!.view.sheetNoteColors).toBe(false)
    expect(n!.view.sheetLyricOffsets).toEqual({ [leadId]: 2.5 })
    expect(n!.view.sheetStaveGap).toBe('wide')
    expect(n!.view.sheetMeasureScale).toBe(1.25)
    expect(n!.view.sheetNoteSpacing).toBe(1.4)
    // Legacy compressed → continuous + dynamic (when sizing omitted)
    const { sheetMeasureSizing: _omit, ...viewSansSizing } = p.view
    const legacy = normalizeTagRollProject({
      ...p,
      view: { ...viewSansSizing, sheetLayout: 'compressed' as 'continuous' },
    })!
    expect(legacy.view.sheetLayout).toBe('continuous')
    expect(legacy.view.sheetMeasureSizing).toBe('dynamic')
    expect(
      normalizeTagRollProject({ ...p, view: { ...p.view, sheetLayout: 'nope' as 'continuous' } })!
        .view.sheetLayout,
    ).toBe('continuous')
    expect(
      normalizeTagRollProject({ ...p, view: { ...p.view, sheetStaveGap: 'nope' as 'normal' } })!
        .view.sheetStaveGap,
    ).toBe('normal')
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

  it('migrates legacy add/edit modes to compose and fills melodyPartId', () => {
    const p = createEmptyTagRollProject()
    const raw = {
      ...p,
      view: { ...p.view, mode: 'edit', melodyPartId: null },
    }
    const n = normalizeTagRollProject(raw)
    expect(n!.view.mode).toBe('compose')
    expect(n!.view.melodyPartId).toBe(p.parts.find((x) => x.name === 'Lead')!.id)
  })

  it('maps each pitch row hitbox with floor (not round-to-nearest)', () => {
    const ch = 14
    const top = midiToY(60, ch)
    expect(yToMidi(top, ch)).toBe(60)
    expect(yToMidi(top + ch * 0.01, ch)).toBe(60)
    expect(yToMidi(top + ch * 0.99, ch)).toBe(60)
    expect(yToMidi(top + ch, ch)).toBe(59)
    // Round-based mapping would flip at mid-cell; floor must not.
    expect(yToMidi(top + ch * 0.75, ch)).toBe(60)
  })

  it('maps px→ticks continuously so snap owns the cell edges', () => {
    const cw = 40 // px per beat
    expect(pxToTicks(0, cw)).toBe(0)
    expect(pxToTicks(cw / 2, cw)).toBeCloseTo(TAG_ROLL_PPQ / 2)
    expect(ticksToPx(TAG_ROLL_PPQ, cw)).toBe(cw)
  })

  it('round-trips swing + midiBakeSwing through normalize', () => {
    const p = createEmptyTagRollProject()
    p.swing = { enabled: true, unit: 'sixteenth', style: 'ratio', amount: 0.8 }
    p.midiBakeSwing = false
    p.metronomeSwing = false
    const again = normalizeTagRollProject(JSON.parse(JSON.stringify(p)))
    expect(again!.swing).toEqual({
      enabled: true,
      unit: 'sixteenth',
      style: 'ratio',
      amount: 0.8,
    })
    expect(again!.midiBakeSwing).toBe(false)
    expect(again!.metronomeSwing).toBe(false)
    const legacy = { ...p } as Record<string, unknown>
    delete legacy.swing
    delete legacy.midiBakeSwing
    delete legacy.metronomeSwing
    const defaults = normalizeTagRollProject(legacy)!
    expect(defaults.swing.enabled).toBe(false)
    expect(defaults.midiBakeSwing).toBe(true)
    expect(defaults.metronomeSwing).toBe(true)
  })
})
