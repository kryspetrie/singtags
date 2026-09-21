import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from './types'
import {
  createFixRegistry,
  lintArrangement,
  keySuggestionFix,
  leadRangeFix,
  orphanStackFix,
} from './qa'
import { autoHarmonizeMelody } from './harmonize'
import { DEFAULT_RANKING_WEIGHTS } from './harmonize/rankingWeights'
import { exportMidi } from '../../application/arranging/ExportMidi'
import { bendRangeEvents, createArrangementMidiExporter, exportArrangementMidi } from '../../adapters/arranging/midi/arrangementMidiExporter'
import { syncStackAfterMelodyEdit } from './syncStacks'
import { phraseLengthHint } from './songEligibility'

describe('fix strategy contract', () => {
  it('orphan canFix implies apply removes stack', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.stacks = [
      {
        id: 'orphan',
        startTick: 9999,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'major',
        voicing: '1351',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: { bass: 48, bari: 52, lead: 60, tenor: 67 },
        ruleTags: [],
      },
    ]
    const lint = lintArrangement(p).find((l) => l.ruleId === 'orphan-stack')!
    expect(orphanStackFix.canFix(lint, p)).toBe(true)
    const patch = orphanStackFix.apply(lint, p)
    expect(patch?.stacks?.every((s) => s.id !== 'orphan')).toBe(true)
  })

  it('keySuggestionFix requires confirmDestructive and clamps MIDI', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 40, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.stacks = [
      {
        id: 's',
        startTick: 0,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'major',
        voicing: '1351',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: { bass: 120, bari: 124, lead: 40, tenor: 127 },
        ruleTags: [],
      },
    ]
    const lint = {
      id: 'k',
      ruleId: 'key-suggestion',
      severity: 'warn' as const,
      message: 't',
      data: { semitones: 12 },
    }
    expect(keySuggestionFix.apply(lint, p)).toBeNull()
    const next = keySuggestionFix.apply(lint, p, { confirmDestructive: true })
    expect(next).toBeTruthy()
    expect(next!.stacks![0]!.midi!.bass).toBeLessThanOrEqual(127)
    expect(next!.stacks![0]!.midi!.tenor).toBe(127)
  })

  it('leadRangeFix nudges out-of-range note with confirm', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 40, startTick: 0, durationTicks: 480, role: 'pmn' }]
    const lint = {
      id: 'r',
      ruleId: 'lead-range',
      severity: 'warn' as const,
      message: 'low',
      noteId: 'm',
    }
    expect(leadRangeFix.canFix(lint, p)).toBe(true)
    expect(leadRangeFix.apply(lint, p)).toBeNull()
    const next = leadRangeFix.apply(lint, p, { confirmDestructive: true })
    expect(next!.melody![0]!.midi).toBeGreaterThanOrEqual(50)
  })

  it('applyAllSafe skips key-suggestion and lead-range', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 40, startTick: 0, durationTicks: 480, role: 'pmn' }]
    const lints = lintArrangement(p, { profile: 'sai11' })
    const { applied } = createFixRegistry().applyAllSafe(p, lints)
    expect(applied.every((id) => !id.includes('key') && !id.includes('range'))).toBe(true)
  })
})

describe('ranking VL/SV weights', () => {
  it('includes voiceLead and strongVoice in default weights', () => {
    expect(DEFAULT_RANKING_WEIGHTS.voiceLead).toBeGreaterThan(0)
    expect(DEFAULT_RANKING_WEIGHTS.strongVoice).toBeGreaterThan(0)
  })
})

describe('export gate + MIDI bytes', () => {
  it('blocks export on error lints but not warn-only', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    // no pillars → error
    const blocked = exportMidi(p, createArrangementMidiExporter(), { blockOnErrors: true })
    expect(blocked.ok).toBe(false)

    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 2000, source: 'user', confirmed: true },
    ]
    p.stacks = autoHarmonizeMelody({
      melody: p.melody,
      pillars: p.pillars,
      tonality: 0,
    })
    const ok = exportMidi(p, createArrangementMidiExporter(), { blockOnErrors: true })
    expect(ok.ok).toBe(true)
  })

  it('emits discrete bend-range CC events and clamped notes', () => {
    const events = bendRangeEvents(0, 2)
    expect(events).toHaveLength(4)
    expect(events.every((e) => e.length === 3)).toBe(true)

    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 2000, source: 'user', confirmed: true },
    ]
    p.stacks = [
      {
        id: 's',
        startTick: 0,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'major',
        voicing: '1351',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: 'p',
        midi: { bass: 48, bari: 52, lead: 60, tenor: 200 },
        ruleTags: [],
      },
    ]
    const bytes = exportArrangementMidi(p, { justIntonation: true })
    // Note-on status + note number must be <= 127 somewhere after header
    let foundNoteOn = false
    for (let i = 0; i < bytes.length - 2; i++) {
      if ((bytes[i]! & 0xf0) === 0x90) {
        expect(bytes[i + 1]!).toBeLessThanOrEqual(127)
        foundNoteOn = true
      }
    }
    expect(foundNoteOn).toBe(true)
  })
})

describe('sync + phrase length', () => {
  it('syncStackAfterMelodyEdit updates lead on pitch change', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 2000, source: 'user', confirmed: true },
    ]
    p.stacks = [
      {
        id: 's',
        startTick: 0,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'major',
        voicing: '1351',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: 'p',
        midi: { bass: 48, bari: 52, lead: 60, tenor: 67 },
        ruleTags: [],
      },
    ]
    const next = { ...p.melody[0]!, midi: 62 }
    const stacks = syncStackAfterMelodyEdit(p, p.melody[0]!, next, { revoice: true })
    expect(stacks[0]!.midi!.lead).toBe(62)
  })

  it('phraseLengthHint fires for non 3/5/7 spans', () => {
    const melody = Array.from({ length: 8 }, (_, i) => ({
      id: `m${i}`,
      midi: 60,
      startTick: i * 1920,
      durationTicks: 1920,
      role: 'pmn' as const,
    }))
    // 8 measures
    const hints = phraseLengthHint(melody, 1920)
    expect(hints.some((h) => h.id === 'phrase-shape')).toBe(true)
  })
})
