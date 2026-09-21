/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from './types'
import { copySelection, cutSelection, pasteClipboard } from './clipboard'
import { selectOnlyMelody, selectOnlyStacks } from './selection'
import { assessFinalReadiness } from './finalChecklist'
import {
  differenceToneBonus,
  commonFundamentalBonus,
  createHarmonicityScorerPreset,
  scoreHarmonicity,
} from './harmonicity/harmonicityScore'
import { BARBERSHOP_CHORDS, placeVoicing } from './chords'
import { createProject, persistProjects, loadProjects } from '../../application/arranging/ProjectCrud'
import { upsertMelodyNote } from '../../application/arranging/UpdateMelody'
import type { ArrangementRepository } from '../../ports/ArrangementRepository'
import type { ArrangementProject } from './types'

function memoryRepo(seed: ArrangementProject[] = []): ArrangementRepository {
  let data = [...seed]
  return {
    async loadAll() {
      return [...data]
    },
    async saveAll(projects) {
      data = [...projects]
    },
    async remove(id) {
      data = data.filter((p) => p.id !== id)
    },
  }
}

describe('clipboard + selection', () => {
  it('copy/cut/paste rebases ticks', () => {
    let p = createEmptyArrangement('Clip', { id: 'a', now: 1 })
    p.melody = [
      { id: 'm1', midi: 60, startTick: 480, durationTicks: 240, role: 'pmn' },
      { id: 'm2', midi: 62, startTick: 960, durationTicks: 240, role: 'pmn' },
    ]
    const clip = copySelection(p, selectOnlyMelody(['m1']))!
    expect(clip.originTick).toBe(480)
    const cut = cutSelection(p, selectOnlyMelody(['m1']))!
    expect(cut.project.melody).toHaveLength(1)
    const pasted = pasteClipboard(cut.project, clip, 0, { next: (x) => `${x}_n` })
    expect(pasted.melody.some((m) => m.startTick === 0 && m.midi === 60)).toBe(true)
  })

  it('copies stacks with midi', () => {
    let p = createEmptyArrangement('S', { id: 'a', now: 1 })
    p.stacks = [
      {
        id: 's1',
        startTick: 0,
        durationTicks: 120,
        rootPc: 0,
        natureId: 'major',
        voicing: '1513',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: { tenor: 67, lead: 60, bari: 55, bass: 48 },
        ruleTags: [],
      },
    ]
    const clip = copySelection(p, selectOnlyStacks(['s1']))!
    const out = pasteClipboard(p, clip, 480, { next: (x) => `${x}_2` })
    expect(out.stacks).toHaveLength(2)
    expect(out.stacks[1]!.startTick).toBe(480)
  })
})

describe('final checklist', () => {
  it('not ready without melody/pillars', () => {
    const r = assessFinalReadiness(createEmptyArrangement())
    expect(r.ready).toBe(false)
    expect(r.items.find((i) => i.id === 'melody')?.ok).toBe(false)
  })
})

describe('harmonicity J6', () => {
  it('scores difference tones near bass', () => {
    const bonus = differenceToneBonus([100, 200, 300], 0.2)
    expect(bonus).toBeGreaterThan(0)
  })

  it('common fundamental bonus for harmonic series', () => {
    expect(commonFundamentalBonus([100, 200, 300, 400], 0.5)).toBeGreaterThan(0)
  })

  it('presets construct scorer', () => {
    const bright = createHarmonicityScorerPreset('bright')
    const chord = BARBERSHOP_CHORDS.find((c) => c.id === 'seventh')!
    const midi = placeVoicing({ chord, rootPc: 0, leadMidi: 60, voicing: '1537' })!
    const s = scoreHarmonicity({ midi, natureId: 'seventh', rootPc: 0, voicing: '1537' })
    expect(bright.score({ midi, natureId: 'seventh', rootPc: 0, voicing: '1537' })).toBeTypeOf(
      'number',
    )
    expect(s).toBeTypeOf('number')
  })
})

describe('project CRUD use-cases', () => {
  it('create + persist + load', async () => {
    const repo = memoryRepo()
    const p = createProject('New', {
      idGen: { next: (x) => `${x}_1` },
      clock: { now: () => 42 },
    })
    expect(p.id).toBe('arr_1')
    expect(p.createdAt).toBe(42)
    await persistProjects([p], repo)
    const loaded = await loadProjects(repo)
    expect(loaded).toHaveLength(1)
    expect(loaded[0]!.title).toBe('New')
  })

  it('upsertMelodyNote inserts sorted', () => {
    let p = createEmptyArrangement('M', { id: 'a', now: 1 })
    p = upsertMelodyNote(p, {
      id: 'm2',
      midi: 62,
      startTick: 480,
      durationTicks: 240,
      role: 'unknown',
    })
    p = upsertMelodyNote(p, {
      id: 'm1',
      midi: 60,
      startTick: 0,
      durationTicks: 240,
      role: 'unknown',
    })
    expect(p.melody.map((m) => m.id)).toEqual(['m1', 'm2'])
  })
})
