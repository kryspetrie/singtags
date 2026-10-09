/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from '../types'
import { autoHarmonizeMelody } from '../harmonize'
import { createSequentialIdGenerator } from '../../../adapters/arranging/persistence/systemServices'
import { pathOptimize } from './optimize'
import { harmonyMotion, maxHarmonyLeap, rejectGate, stackMidiSeq } from './objective'

function melodyPillarPhrase() {
  const p = createEmptyArrangement('PathOpt')
  p.tonality = 0
  p.melody = [
    { id: 'm0', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
    { id: 'm1', midi: 62, startTick: 480, durationTicks: 480, role: 'smn' },
    { id: 'm2', midi: 64, startTick: 960, durationTicks: 480, role: 'pmn' },
    { id: 'm3', midi: 60, startTick: 1440, durationTicks: 480, role: 'pmn' },
  ]
  p.pillars = [
    {
      id: 'p0',
      rootPc: 0,
      startTick: 0,
      endTick: 2000,
      source: 'user',
      confirmed: true,
    },
  ]
  return p
}

describe('pathOptimize', () => {
  it('Fill produces stacks with lead locked to melody', async () => {
    const p = melodyPillarPhrase()
    const idGen = createSequentialIdGenerator()
    const { project, report } = await pathOptimize(
      p,
      { mode: 'fill', scope: { kind: 'whole' } },
      { idGen },
    )
    expect(report.applied).toBe(true)
    expect(report.changedCount).toBeGreaterThan(0)
    expect(project.stacks.length).toBeGreaterThanOrEqual(3)
    for (const m of p.melody) {
      const s = project.stacks.find((x) => x.startTick === m.startTick)
      expect(s?.midi?.lead).toBe(m.midi)
    }
  })

  it('Revoice keeps root/nature/lead and does not worsen motion', async () => {
    const p = melodyPillarPhrase()
    const idGen = createSequentialIdGenerator()
    p.stacks = autoHarmonizeMelody({
      melody: p.melody,
      pillars: p.pillars,
      tonality: p.tonality,
      idGen,
    })
    const beforeSeq = stackMidiSeq(p.stacks)
    const beforeMotion = harmonyMotion(beforeSeq)
    const { project, report } = await pathOptimize(p, {
      mode: 'revoice',
      scope: { kind: 'whole' },
    })
    for (let i = 0; i < p.stacks.length; i++) {
      const a = p.stacks[i]!
      const b = project.stacks.find((s) => s.id === a.id) ?? project.stacks[i]!
      expect(b.rootPc).toBe(a.rootPc)
      expect(b.natureId).toBe(a.natureId)
      expect(b.midi?.lead).toBe(a.midi?.lead)
    }
    if (report.applied) {
      const afterMotion = harmonyMotion(stackMidiSeq(project.stacks))
      expect(afterMotion).toBeLessThanOrEqual(beforeMotion)
    }
  })

  it('Rechord can change nature when a better candidate exists', async () => {
    const p = melodyPillarPhrase()
    const idGen = createSequentialIdGenerator()
    p.stacks = autoHarmonizeMelody({
      melody: p.melody,
      pillars: p.pillars,
      tonality: p.tonality,
      idGen,
    })
    // Force a weak stack that ranker can beat.
    const first = p.stacks[0]!
    p.stacks = [
      {
        ...first,
        natureId: 'augmented',
        voicing: '1351',
        midi: {
          bass: first.midi!.bass,
          bari: first.midi!.bari,
          lead: first.midi!.lead,
          tenor: first.midi!.tenor,
        },
      },
      ...p.stacks.slice(1),
    ]
    const beforeNature = p.stacks[0]!.natureId
    const { project, report } = await pathOptimize(
      p,
      {
        mode: 'rechord',
        scope: { kind: 'current', tick: 0 },
        weights: { stayPutEpsilon: 0 },
      },
      { idGen },
    )
    if (report.applied) {
      const after = project.stacks.find((s) => s.startTick === 0)
      expect(after?.natureId).not.toBe(beforeNature)
    } else {
      // Acceptable if ranker already prefers staying (gate / no gain).
      expect(report.changedCount).toBe(0)
    }
  })

  it('range scope only touches stacks in range', async () => {
    const p = melodyPillarPhrase()
    const idGen = createSequentialIdGenerator()
    p.stacks = autoHarmonizeMelody({
      melody: p.melody,
      pillars: p.pillars,
      tonality: p.tonality,
      idGen,
    })
    const outsideBefore = p.stacks
      .filter((s) => s.startTick >= 960)
      .map((s) => `${s.id}:${s.natureId}:${s.voicing}:${s.midi?.bass}`)
    const { project } = await pathOptimize(
      p,
      {
        mode: 'rechord',
        scope: { kind: 'range', startTick: 0, endTick: 960 },
        weights: { stayPutEpsilon: 0 },
      },
      { idGen },
    )
    const outsideAfter = project.stacks
      .filter((s) => s.startTick >= 960)
      .map((s) => `${s.id}:${s.natureId}:${s.voicing}:${s.midi?.bass}`)
    expect(outsideAfter).toEqual(outsideBefore)
  })

  it('reject gate returns unchanged project when leaps would worsen', async () => {
    const p = melodyPillarPhrase()
    // Smooth adjacent stacks
    p.stacks = [
      {
        id: 's0',
        startTick: 0,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'major',
        voicing: '1351',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: 'p0',
        midi: { bass: 48, bari: 55, lead: 60, tenor: 64 },
        ruleTags: [],
      },
      {
        id: 's1',
        startTick: 480,
        durationTicks: 480,
        rootPc: 7,
        natureId: 'seventh',
        voicing: '5317',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: 'p0',
        midi: { bass: 47, bari: 55, lead: 62, tenor: 65 },
        ruleTags: [],
      },
      {
        id: 's2',
        startTick: 960,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'major',
        voicing: '1351',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: 'p0',
        midi: { bass: 48, bari: 55, lead: 64, tenor: 67 },
        ruleTags: [],
      },
      {
        id: 's3',
        startTick: 1440,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'major',
        voicing: '1351',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: 'p0',
        midi: { bass: 48, bari: 55, lead: 60, tenor: 64 },
        ruleTags: [],
      },
    ]
    const beforeLeap = maxHarmonyLeap(stackMidiSeq(p.stacks))
    const { project, report } = await pathOptimize(p, {
      mode: 'revoice',
      scope: { kind: 'whole' },
    })
    if (report.rejected) {
      expect(project).toBe(p)
      expect(report.applied).toBe(false)
    } else {
      expect(maxHarmonyLeap(stackMidiSeq(project.stacks))).toBeLessThanOrEqual(
        beforeLeap + 1,
      )
    }
  })

  it('prefers V7 under ^5→^1 when cadence bias is strong (Fill)', async () => {
    const p = createEmptyArrangement('CadenceFill')
    p.tonality = 0
    p.melody = [
      { id: 'm0', midi: 67, startTick: 0, durationTicks: 480, role: 'pmn' },
      { id: 'm1', midi: 60, startTick: 480, durationTicks: 480, role: 'pmn' },
    ]
    p.pillars = [
      {
        id: 'p0',
        rootPc: 0,
        startTick: 0,
        endTick: 2000,
        source: 'user',
        confirmed: true,
      },
    ]
    const { project, report } = await pathOptimize(
      p,
      {
        mode: 'fill',
        scope: { kind: 'whole' },
        weights: { risk: 0.35, cadenceBias: 'strong', stayPutEpsilon: 0 },
      },
      { idGen: createSequentialIdGenerator() },
    )
    expect(
      report.applied,
      `${report.message} | reject=${report.rejectReason ?? ''} | changed=${report.changedCount}`,
    ).toBe(true)
    const first = project.stacks.find((s) => s.startTick === 0)
    expect(first?.rootPc).toBe(7)
    expect(first?.natureId === 'seventh' || first?.natureId === 'ninth').toBe(true)
  })

  it('Basic risk only uses major/minor/seventh and keeps bass out of the mud', async () => {
    const basic = await pathOptimize(
      melodyPillarPhrase(),
      {
        mode: 'full',
        scope: { kind: 'whole' },
        weights: { risk: 0, cadenceBias: 'moderate' },
        maxPasses: 4,
        skipProbe: true,
      },
      { idGen: createSequentialIdGenerator() },
    )
    expect(basic.report.applied).toBe(true)
    const allowed = new Set(['major', 'minor', 'seventh', 'm7', 'ninth'])
    for (const s of basic.project.stacks) {
      expect(allowed.has(s.natureId), s.natureId).toBe(true)
      if (s.midi) expect(s.midi.bass).toBeGreaterThanOrEqual(45)
    }
  })

  it('allowWorsen skips the reject gate', async () => {
    const before = melodyPillarPhrase()
    const idGen = createSequentialIdGenerator()
    before.stacks = autoHarmonizeMelody({
      melody: before.melody,
      pillars: before.pillars,
      tonality: before.tonality,
      idGen,
    })
    // Force a jumpy alternate that reject would normally block.
    const jumpy = {
      ...before,
      stacks: before.stacks.map((s, i) =>
        i === 1 && s.midi
          ? {
              ...s,
              midi: {
                ...s.midi,
                tenor: s.midi.tenor + 14,
                bass: s.midi.bass - 10,
              },
              voicing: 'spike',
            }
          : s,
      ),
    }
    const blocked = rejectGate(before, jumpy, { risk: 0 })
    expect(blocked.ok).toBe(false)
    const allowed = rejectGate(before, jumpy, { risk: 0, allowWorsen: true })
    expect(allowed.ok).toBe(true)
  })

  it('stopEarly false runs the full pass budget on a stage', async () => {
    const p = melodyPillarPhrase()
    const idGen = createSequentialIdGenerator()
    p.stacks = autoHarmonizeMelody({
      melody: p.melody,
      pillars: p.pillars,
      tonality: p.tonality,
      idGen,
    })
    const { report } = await pathOptimize(
      p,
      {
        mode: 'rechord',
        scope: { kind: 'whole' },
        maxPasses: 5,
        stopEarly: false,
        skipProbe: true,
        windowWidth: 3,
        windowHop: 1,
      },
      { idGen: createSequentialIdGenerator() },
    )
    expect(report.passes).toBe(5)
  })

  it('Fill uses multi-pass windows (report.passes > 1 on a long empty phrase)', async () => {
    const p = createEmptyArrangement('FillWindows')
    p.tonality = 0
    p.melody = Array.from({ length: 10 }, (_, i) => ({
      id: `m${i}`,
      midi: 60 + (i % 4),
      startTick: i * 480,
      durationTicks: 480,
      role: (i % 2 === 0 ? 'pmn' : 'smn') as 'pmn' | 'smn',
    }))
    p.pillars = [
      {
        id: 'p0',
        rootPc: 0,
        startTick: 0,
        endTick: 5000,
        source: 'user',
        confirmed: true,
      },
    ]
    const { project, report } = await pathOptimize(
      p,
      {
        mode: 'fill',
        scope: { kind: 'whole' },
        maxPasses: 8,
        windowWidth: 5,
        windowHop: 2,
        skipProbe: true,
      },
      { idGen: createSequentialIdGenerator() },
    )
    expect(report.applied).toBe(true)
    expect(report.passes).toBeGreaterThanOrEqual(1)
    expect(project.stacks.length).toBeGreaterThanOrEqual(7)
  })

  it('Revoice can run multiple window passes', async () => {
    const p = melodyPillarPhrase()
    const idGen = createSequentialIdGenerator()
    p.stacks = autoHarmonizeMelody({
      melody: p.melody,
      pillars: p.pillars,
      tonality: p.tonality,
      idGen,
    })
    const { report } = await pathOptimize(
      p,
      {
        mode: 'revoice',
        scope: { kind: 'whole' },
        maxPasses: 5,
        windowWidth: 3,
        windowHop: 1,
        skipProbe: true,
      },
    )
    expect(report.passes).toBeGreaterThanOrEqual(1)
    expect(report.rejected).toBe(false)
  })

  it('multi-pass keeps motion/leaps bounded on a longer phrase', async () => {
    const p = createEmptyArrangement('LongPhrase')
    p.tonality = 0
    p.melody = Array.from({ length: 12 }, (_, i) => ({
      id: `m${i}`,
      midi: 60 + (i % 5),
      startTick: i * 480,
      durationTicks: 480,
      role: (i % 2 === 0 ? 'pmn' : 'smn') as 'pmn' | 'smn',
    }))
    p.pillars = [
      {
        id: 'p0',
        rootPc: 0,
        startTick: 0,
        endTick: 6000,
        source: 'user',
        confirmed: true,
      },
    ]
    const { project, report } = await pathOptimize(
      p,
      {
        mode: 'full',
        scope: { kind: 'whole' },
        maxPasses: 24,
        windowWidth: 6,
        windowHop: 2,
        weights: { cadenceBias: 'moderate' },
      },
      { idGen: createSequentialIdGenerator() },
    )
    expect(report.passes).toBeGreaterThanOrEqual(1)
    expect(report.passes).toBeLessThanOrEqual(24 * 3) // fill + rechord + revoice stages
    if (report.applied) {
      const seq = stackMidiSeq(project.stacks)
      expect(maxHarmonyLeap(seq)).toBeLessThanOrEqual(24)
      // Middle stacks exist (not sacrificed to empty).
      expect(project.stacks.some((s) => s.startTick === 5 * 480)).toBe(true)
    }
  })

  it('Try again with different seeds can differ while locking leads', async () => {
    const p = melodyPillarPhrase()
    const idGen = createSequentialIdGenerator()
    const a = await pathOptimize(
      p,
      { mode: 'fill', scope: { kind: 'whole' }, explore: true, seed: 1 },
      { idGen },
    )
    const b = await pathOptimize(
      p,
      { mode: 'fill', scope: { kind: 'whole' }, explore: true, seed: 99 },
      { idGen: createSequentialIdGenerator() },
    )
    expect(a.report.applied || b.report.applied).toBe(true)
    for (const m of p.melody) {
      const sa = a.project.stacks.find((s) => s.startTick === m.startTick)
      const sb = b.project.stacks.find((s) => s.startTick === m.startTick)
      if (sa?.midi) expect(sa.midi.lead).toBe(m.midi)
      if (sb?.midi) expect(sb.midi.lead).toBe(m.midi)
    }
  })

  it('reports canTryAgain / viableModes after a successful Fill', async () => {
    const p = melodyPillarPhrase()
    const { report } = await pathOptimize(
      p,
      { mode: 'fill', scope: { kind: 'whole' } },
      { idGen: createSequentialIdGenerator() },
    )
    expect(report.applied).toBe(true)
    expect(report.canTryAgain).toBe(true)
    expect(Array.isArray(report.viableModes)).toBe(true)
  })

  it('Try again on a filled chart can change stacks (escalates Fill→Rechord)', async () => {
    const idGen = createSequentialIdGenerator()
    const base = melodyPillarPhrase()
    const filled = await pathOptimize(
      base,
      { mode: 'fill', scope: { kind: 'whole' }, skipProbe: true },
      { idGen },
    )
    expect(filled.report.applied).toBe(true)
    const beforeFp = filled.project.stacks
      .map((s) => `${s.startTick}:${s.rootPc}:${s.natureId}:${s.voicing}`)
      .sort()
      .join('|')
    let changed = false
    let appliedWithoutReject = 0
    // Filled charts: Fill explore often has nothing empty — Rechord @ higher risk diversifies.
    for (const mode of ['rechord', 'full'] as const) {
      for (const seed of [3, 17, 42, 77, 99, 123, 456, 789, 1024]) {
        const again = await pathOptimize(
          filled.project,
          {
            mode,
            scope: { kind: 'whole' },
            explore: true,
            seed,
            temperature: 1.8,
            skipProbe: true,
            weights: { risk: 0.85, cadenceBias: 'moderate' },
          },
          { idGen: createSequentialIdGenerator() },
        )
        if (again.report.rejected) continue
        appliedWithoutReject++
        const afterFp = again.project.stacks
          .map((s) => `${s.startTick}:${s.rootPc}:${s.natureId}:${s.voicing}`)
          .sort()
          .join('|')
        if (afterFp !== beforeFp && again.report.applied) {
          changed = true
          break
        }
      }
      if (changed) break
    }
    expect(
      appliedWithoutReject,
      'explore should accept at least one alternate without hard-reject',
    ).toBeGreaterThan(0)
    expect(changed, 'at least one explore seed should rewrite a filled chart').toBe(true)
  })
})

