/**
 * Adversarial coverage for FixStrategies + export gates + ranking invariants.
 */
import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from './types'
import { autoHarmonizeMelody, candidatesForMelodyNote } from './harmonize'
import { createFixRegistry, lintArrangement } from './qa'
import { exportMidi } from '../../application/arranging/ExportMidi'
import { createArrangementMidiExporter } from '../../adapters/arranging/midi/arrangementMidiExporter'
import { syncStackAfterMelodyEdit } from './syncStacks'
import { findEmbellishmentSeeds, applyEmbellishmentSeed } from './embellishments'
import { tipsForProfile } from './orgTips'
import { doubledThirdLints } from './denseQa'
import { createSequentialIdGenerator } from '../../adapters/arranging/persistence/systemServices'

function projectWithMelody() {
  const idGen = createSequentialIdGenerator()
  const p = createEmptyArrangement('adv', { id: idGen.next('arr'), now: 1 })
  p.contestProfile = 'sai11'
  p.melody = [60, 64, 67, 60, 62, 64, 65, 67].map((midi, i) => ({
    id: idGen.next('mel'),
    midi,
    startTick: i * 480,
    durationTicks: 480,
    role: i % 2 === 0 ? ('pmn' as const) : ('smn' as const),
  }))
  p.pillars = [
    {
      id: idGen.next('pil'),
      rootPc: 0,
      startTick: 0,
      endTick: 4800,
      source: 'user',
      confirmed: true,
    },
  ]
  p.stacks = autoHarmonizeMelody({
    melody: p.melody,
    pillars: p.pillars,
    tonality: 0,
    profile: 'sai11',
    idGen,
  })
  return { p, idGen }
}

describe('adversarial fixing & export', () => {
  it('illegal nature fix always lands inside sai11 allowlist', () => {
    const { p, idGen } = projectWithMelody()
    if (!p.stacks[0]) throw new Error('expected stacks')
    p.stacks[0] = { ...p.stacks[0], natureId: 'half-dim' }
    const lint = lintArrangement(p, { profile: 'sai11' }).find((l) => l.ruleId === 'illegal-nature')
    expect(lint).toBeTruthy()
    const reg = createFixRegistry()
    const next = reg.applyToProject(lint!, p, { idGen })
    expect(next).toBeTruthy()
    expect(next!.stacks[0]!.natureId).not.toBe('half-dim')
    const again = lintArrangement(next!, { profile: 'sai11' }).filter(
      (l) => l.stackId === lint!.stackId && l.ruleId === 'illegal-nature',
    )
    expect(again).toHaveLength(0)
  })

  it('orphan fix removes stack; export blocks on remaining errors', () => {
    const { p } = projectWithMelody()
    p.stacks.push({
      id: 'orphan',
      startTick: 99999,
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
    })
    const lint = lintArrangement(p, { profile: 'sai11' }).find((l) => l.ruleId === 'orphan-stack')
    expect(lint).toBeTruthy()
    const cleaned = createFixRegistry().applyToProject(lint!, p)!
    expect(cleaned.stacks.every((s) => s.id !== 'orphan')).toBe(true)

    // Force an error and ensure export blocks
    cleaned.pillars = []
    const blocked = exportMidi(cleaned, createArrangementMidiExporter(), { blockOnErrors: true })
    expect(blocked.ok).toBe(false)
  })

  it('key transpose requires confirmDestructive and shifts tonality', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm1', midi: 40, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.tonality = 0
    const lint = lintArrangement(p, { profile: 'sai11' }).find((l) => l.ruleId === 'key-suggestion')
    expect(lint).toBeTruthy()
    const reg = createFixRegistry()
    expect(reg.applyToProject(lint!, p)).toBeNull()
    const next = reg.applyToProject(lint!, p, { confirmDestructive: true })
    expect(next).toBeTruthy()
    expect(next!.melody[0]!.midi).toBeGreaterThan(40)
    expect(next!.tonality).not.toBe(0)
  })

  it('applyAllSafe never applies key-suggestion', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm1', midi: 40, startTick: 0, durationTicks: 480, role: 'pmn' }]
    const lints = lintArrangement(p, { profile: 'sai11' })
    const { applied } = createFixRegistry().applyAllSafe(p, lints)
    expect(applied.every((id) => id !== 'key-suggest')).toBe(true)
  })

  it('syncStackAfterMelodyEdit revoices when lead MIDI changes', () => {
    const { p } = projectWithMelody()
    const prev = p.melody[0]!
    const next = { ...prev, midi: prev.midi + 2 }
    const stacks = syncStackAfterMelodyEdit(p, prev, next, { revoice: true })
    const stack = stacks.find((s) => s.startTick === next.startTick)
    expect(stack?.midi?.lead).toBe(next.midi)
  })

  it('embellishment seed attaches swipe stack under long hold', () => {
    const p = createEmptyArrangement()
    p.melody = [
      { id: 'm1', midi: 60, startTick: 0, durationTicks: 1920, role: 'pmn' },
      { id: 'm2', midi: 62, startTick: 2400, durationTicks: 480, role: 'pmn' },
    ]
    p.stacks = [
      {
        id: 's1',
        startTick: 0,
        durationTicks: 1920,
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
    const seeds = findEmbellishmentSeeds(p)
    expect(seeds.some((s) => s.kind === 'swipe' && s.suggestedStack)).toBe(true)
    const swipe = seeds.find((s) => s.suggestedStack)!
    const next = applyEmbellishmentSeed(p, swipe)
    expect(next.stacks.some((s) => s.layer === 'embellishment')).toBe(true)
  })

  it('org tips include SAI vocabulary for sai11', () => {
    const tips = tipsForProfile('sai11', 'ttbb')
    expect(tips.some((t) => t.id === 'sai-11')).toBe(true)
    expect(tips.some((t) => t.id === 'ttbb-range')).toBe(true)
  })

  it('style legality never overridden: ranking only among allowlisted natures', () => {
    const note = {
      id: 'm',
      midi: 60,
      startTick: 0,
      durationTicks: 480,
      role: 'pmn' as const,
    }
    const pillar = {
      id: 'p',
      rootPc: 0,
      startTick: 0,
      endTick: 2000,
      source: 'user' as const,
      confirmed: true,
    }
    const cands = candidatesForMelodyNote({
      note,
      pillar,
      tonality: 0,
      prevRootPc: null,
      profile: 'sai11',
      limit: 20,
    })
    expect(cands.every((c) => c.natureId !== 'half-dim')).toBe(true)
  })

  it('doubled-third detector fires on duplicated third PC', () => {
    // C major with E in bari and lead
    const lints = doubledThirdLints([
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
        midi: { bass: 48, bari: 52, lead: 64, tenor: 67 }, // E3 and E4
        ruleTags: [],
      },
    ])
    expect(lints.some((l) => l.ruleId === 'doubled-third')).toBe(true)
  })

  it('copyright reminder always present once melody exists', () => {
    const { p } = projectWithMelody()
    const lints = lintArrangement(p, { profile: 'sai11' })
    expect(lints.some((l) => l.ruleId === 'copyright-reminder')).toBe(true)
  })
})
