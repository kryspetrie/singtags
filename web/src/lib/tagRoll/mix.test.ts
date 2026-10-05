import { describe, expect, it } from 'vitest'
import {
  applyOpenMixDefaults,
  defaultMixForPart,
  isDetectedAudible,
  isPartAudible,
  isSketchAudible,
  mixForPart,
  projectHasDefinedChords,
  syncProjectMix,
} from './mix'

describe('tagRoll mix', () => {
  it('defaults TLBB pan/volume', () => {
    expect(defaultMixForPart({ id: 't', name: 'Tenor' }).pan).toBeCloseTo(-0.6)
    expect(defaultMixForPart({ id: 'l', name: 'Lead' }).pan).toBeCloseTo(-0.2)
    expect(defaultMixForPart({ id: 'b', name: 'Bass' }).pan).toBeCloseTo(0.2)
    expect(defaultMixForPart({ id: 'r', name: 'Bari' }).pan).toBeCloseTo(0.6)
    expect(defaultMixForPart({ id: 'l', name: 'Lead' }).volume).toBeGreaterThan(
      defaultMixForPart({ id: 't', name: 'Tenor' }).volume,
    )
  })

  it('solo gates audible parts', () => {
    const mix = [
      { partId: 'a', volume: 1, pan: 0, mute: false, solo: true },
      { partId: 'b', volume: 1, pan: 0, mute: false, solo: false },
      { partId: 'c', volume: 1, pan: 0, mute: true, solo: true },
    ]
    expect(isPartAudible('a', mix)).toBe(true)
    expect(isPartAudible('b', mix)).toBe(false)
    expect(isPartAudible('c', mix)).toBe(false)
  })

  it('syncs mix rows to parts', () => {
    const parts = [
      { id: '1', name: 'Lead', color: '#000', midiGroup: 'upper' as const },
      { id: '2', name: 'Bass', color: '#000', midiGroup: 'lower' as const },
    ]
    const synced = syncProjectMix(parts, [
      { partId: '1', volume: 0.5, pan: -1, mute: true, solo: false },
      { partId: 'orphan', volume: 1, pan: 0, mute: false, solo: false },
    ])
    expect(synced).toHaveLength(5)
    expect(synced[0]!.mute).toBe(true)
    expect(synced[0]!.volume).toBe(0.5)
    expect(synced[1]!.partId).toBe('2')
    expect(synced[2]!.partId).toBe('mix:harmony-sketch')
    expect(synced[2]!.mute).toBe(false)
    expect(synced[3]!.partId).toBe('mix:harmony-detected')
    expect(synced[3]!.mute).toBe(true)
    expect(synced[4]!.partId).toBe('mix:metronome')
    expect(mixForPart('2', synced).pan).toBeCloseTo(0.2)
  })

  it('unmuted Sketch + Detected layer without solo (no exclusive gate)', () => {
    const parts = [{ id: '1', name: 'Lead', color: '#000', midiGroup: 'upper' as const }]
    const synced = syncProjectMix(parts, null).map((m) =>
      m.partId === 'mix:harmony-detected' || m.partId === 'mix:harmony-sketch'
        ? { ...m, mute: false, solo: false }
        : m,
    )
    expect(isSketchAudible(synced)).toBe(true)
    expect(isDetectedAudible(synced)).toBe(true)
    expect(isPartAudible('1', synced)).toBe(true)
  })

  it('detected channel is audible when soloed even if muted was default', () => {
    const parts = [{ id: '1', name: 'Lead', color: '#000', midiGroup: 'upper' as const }]
    const synced = syncProjectMix(parts, null)
    const detect = synced.find((m) => m.partId === 'mix:harmony-detected')!
    expect(detect.mute).toBe(true)
    expect(isPartAudible('mix:harmony-detected', synced)).toBe(false)
    const withSolo = synced.map((m) =>
      m.partId === 'mix:harmony-detected' ? { ...m, mute: false, solo: true } : m,
    )
    expect(isPartAudible('mix:harmony-detected', withSolo)).toBe(true)
    expect(isPartAudible('1', withSolo)).toBe(false)
  })

  it('projectHasDefinedChords detects locked sketch or non-melody notes', () => {
    const parts = [
      { id: 'lead', name: 'Lead' },
      { id: 'bass', name: 'Bass' },
    ]
    expect(
      projectHasDefinedChords({
        parts,
        notes: [{ partId: 'lead' }],
        view: { melodyPartId: 'lead' },
        harmonySketch: [],
      }),
    ).toBe(false)
    expect(
      projectHasDefinedChords({
        parts,
        notes: [{ partId: 'lead' }],
        view: { melodyPartId: 'lead' },
        harmonySketch: [{ locked: true }],
      }),
    ).toBe(true)
    expect(
      projectHasDefinedChords({
        parts,
        notes: [{ partId: 'lead' }, { partId: 'bass' }],
        view: { melodyPartId: 'lead' },
        harmonySketch: [],
      }),
    ).toBe(true)
  })

  it('applyOpenMixDefaults mutes Sketch+Detected when chords exist', () => {
    const parts = [
      { id: 'lead', name: 'Lead', color: '#000', midiGroup: 'upper' as const },
      { id: 'bass', name: 'Bass', color: '#000', midiGroup: 'lower' as const },
    ]
    const unmuted = [
      { partId: 'lead', volume: 1, pan: 0, mute: false, solo: false },
      { partId: 'bass', volume: 1, pan: 0, mute: false, solo: false },
      { partId: 'mix:harmony-sketch', volume: 0.6, pan: 0, mute: false, solo: true },
      { partId: 'mix:harmony-detected', volume: 0.5, pan: 0, mute: false, solo: true },
    ]
    const withChords = applyOpenMixDefaults(parts, unmuted, {
      parts,
      notes: [{ partId: 'lead' }, { partId: 'bass' }],
      view: { melodyPartId: 'lead' },
      harmonySketch: [],
    })
    expect(withChords.find((m) => m.partId === 'mix:harmony-sketch')).toMatchObject({
      mute: true,
      solo: false,
    })
    expect(withChords.find((m) => m.partId === 'mix:harmony-detected')).toMatchObject({
      mute: true,
      solo: false,
    })

    const melodyOnly = applyOpenMixDefaults(parts, unmuted, {
      parts,
      notes: [{ partId: 'lead' }],
      view: { melodyPartId: 'lead' },
      harmonySketch: [],
    })
    expect(melodyOnly.find((m) => m.partId === 'mix:harmony-sketch')!.mute).toBe(false)
  })
})
