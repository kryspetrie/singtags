/**
 * Application-layer use-cases + remaining domain coverage (JI, DocumentOps, etc.).
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyArrangement, type ArrangementProject, type MelodyEvent } from '../../domain/arranging/types'
import {
  autoHarmonize,
  listCandidatesForNote,
  applyCandidateToProject,
} from './AutoHarmonize'
import { applyFix, applyAllSafeFixes, canApplyFix } from './ApplyFix'
import { exportMidi } from './ExportMidi'
import { exportMusicXml } from './ExportMusicXml'
import { inferPillars, confirmAllPillars } from './InferPillars'
import {
  explanationForWizardStep,
  explanationForLint,
  explanationAfterFix,
  explanationForCandidate,
} from './ExplainCoach'
import {
  suggestEmbellishments,
  applyEmbellishment,
  polishArrangementVoicing,
  assessFinal,
  copyArrangementSelection,
  cutArrangementSelection,
  pasteArrangementClipboard,
} from './DocumentOps'
import {
  createProject,
  persistProjects,
  loadProjects,
  deleteProject,
} from './ProjectCrud'
import { upsertMelodyNote, removeMelodyNote, setProjectMeta } from './UpdateMelody'
import { strengthenArrangement } from './Strengthen'
import { autoLabelMelodyRoles } from './LabelMelodyRoles'
import { createFixRegistry, lintArrangement } from '../../domain/arranging/qa'
import { createArrangementMusicXmlExporter } from '../../adapters/arranging/musicxml/createMusicXmlExporter'
import { createArrangementMidiExporter } from '../../adapters/arranging/midi/arrangementMidiExporter'
import {
  createSequentialIdGenerator,
  createFixedClock,
  createBrowserIdGenerator,
  createSystemClock,
} from '../../adapters/arranging/persistence/systemServices'
import { createMemoryRepository } from '../../adapters/arranging/persistence/localStorageRepository'
import type { ArrangementRepository } from '../../ports/ArrangementRepository'
import {
  justCentsForVoicing,
  roleCents,
} from '../../domain/arranging/justIntonation'
import { emptySelection, selectOnlyMelody, toggleId, selectionIsEmpty } from '../../domain/arranging/selection'
import { createArrangingServices, setArrangingServicesForTests } from '../../composition/arranging'
import { BARBERSHOP_CHORDS, placeVoicing } from '../../domain/arranging/chords'

function phrase(): ArrangementProject {
  const p = createEmptyArrangement('App')
  p.contestProfile = 'sai11'
  p.melody = [60, 64, 67, 65].map((midi, i) => ({
    id: `m${i}`,
    midi,
    startTick: i * 480,
    durationTicks: 480,
    role: 'unknown' as const,
  }))
  p.pillars = [
    { id: 'p', rootPc: 0, startTick: 0, endTick: 3000, source: 'user', confirmed: true },
  ]
  p.stacks = autoHarmonize(p)
  return p
}

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

describe('AutoHarmonize use-case', () => {
  it('listCandidatesForNote returns [] without pillar', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    expect(listCandidatesForNote(p, p.melody[0]!)).toEqual([])
  })

  it('lists candidates and applyCandidateToProject replaces stack at onset', () => {
    const p = phrase()
    const note = p.melody[1]!
    const cands = listCandidatesForNote(p, note, { limit: 8 })
    expect(cands.length).toBeGreaterThan(0)
    const next = applyCandidateToProject(p, note, cands[0]!, {
      idGen: createSequentialIdGenerator(),
    })
    const at = next.stacks.find((s) => s.startTick === note.startTick)
    expect(at?.natureId).toBe(cands[0]!.natureId)
    expect(at?.midi?.lead).toBe(note.midi)
  })
})

describe('ApplyFix use-case', () => {
  it('canApplyFix / applyFix for orphan stacks', () => {
    const p = phrase()
    p.stacks.push({
      id: 'orphan',
      startTick: 99999,
      durationTicks: 120,
      rootPc: 0,
      natureId: 'major',
      voicing: '1513',
      spread: false,
      layer: 'primary',
      scfGroup: null,
      pillarId: null,
      midi: { bass: 48, bari: 52, lead: 60, tenor: 67 },
      ruleTags: [],
    })
    const lint = lintArrangement(p).find((l) => l.ruleId === 'orphan-stack')
    expect(lint).toBeTruthy()
    expect(canApplyFix(p, lint!)).toBe(true)
    const fixed = applyFix(p, lint!)
    expect(fixed!.stacks.every((s) => s.id !== 'orphan')).toBe(true)
  })

  it('applyAllSafeFixes skips key-suggestion without destructive confirm', () => {
    const p = phrase()
    p.melody[0] = { ...p.melody[0]!, midi: 84 }
    const lints = lintArrangement(p)
    const { applied } = applyAllSafeFixes(p, lints)
    expect(applied.every((id) => !String(id).includes('key'))).toBe(true)
  })
})

describe('Export gates', () => {
  it('exportMidi and exportMusicXml block on errors when requested', () => {
    const bad = createEmptyArrangement()
    const midi = exportMidi(bad, createArrangementMidiExporter(), { blockOnErrors: true })
    expect(midi.ok).toBe(false)
    const xml = exportMusicXml(bad, createArrangementMusicXmlExporter(), { blockOnErrors: true })
    expect(xml.ok).toBe(false)
  })

  it('exportMusicXml succeeds for harmonized phrase', () => {
    const r = exportMusicXml(phrase(), createArrangementMusicXmlExporter())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.xml).toContain('score-partwise')
  })
})

describe('Infer / label / strengthen / explain', () => {
  it('inferPillars + confirmAllPillars', () => {
    const p = createEmptyArrangement()
    p.melody = [60, 64, 67, 65, 64, 62, 60].map((midi, i) => ({
      id: `m${i}`,
      midi,
      startTick: i * 480,
      durationTicks: 480,
      role: 'pmn' as const,
    }))
    const pillars = inferPillars(p, { idGen: createSequentialIdGenerator() })
    expect(pillars.length).toBeGreaterThan(0)
    expect(pillars.every((x) => !x.confirmed)).toBe(true)
    const confirmed = confirmAllPillars({ ...p, pillars })
    expect(confirmed.pillars.every((x) => x.confirmed)).toBe(true)
  })

  it('autoLabelMelodyRoles and strengthenArrangement', () => {
    let p = phrase()
    p = autoLabelMelodyRoles(p)
    expect(p.melody.some((m) => m.role === 'pmn' || m.role === 'smn')).toBe(true)
    const strengthened = strengthenArrangement(p, { idGen: createSequentialIdGenerator() })
    expect(strengthened.stacks.length).toBeGreaterThan(0)
  })

  it('ExplainCoach DTOs for wizard, lint, candidate, fix', () => {
    const p = phrase()
    const wiz = explanationForWizardStep('step1_roots')
    expect(wiz?.headline.length).toBeGreaterThan(0)
    const lint = lintArrangement(p)[0]
    if (lint) expect(explanationForLint(lint).body.length).toBeGreaterThan(0)
    const cands = listCandidatesForNote(p, p.melody[0]!)
    if (cands[0]) expect(explanationForCandidate(cands[0]).body.length).toBeGreaterThan(0)
    expect(explanationAfterFix('orphan-stack').title.length).toBeGreaterThan(0)
  })
})

describe('DocumentOps + selection', () => {
  it('embellish / polish / final / clipboard', () => {
    let p = phrase()
    p.melody[0] = { ...p.melody[0]!, durationTicks: 960 }
    const seeds = suggestEmbellishments(p)
    expect(seeds.length).toBeGreaterThan(0)
    const seed = seeds.find((s) => s.suggestedStack)
    if (seed) p = applyEmbellishment(p, seed)
    const polished = polishArrangementVoicing(p)
    expect(polished.project.stacks.length).toBeGreaterThan(0)
    expect(assessFinal(p).items.length).toBeGreaterThan(0)

    const sel = selectOnlyMelody([p.melody[0]!.id])
    const clip = copyArrangementSelection(p, sel)!
    const cut = cutArrangementSelection(p, sel)!
    expect(cut.project.melody.every((m) => m.id !== p.melody[0]!.id)).toBe(true)
    const pasted = pasteArrangementClipboard(cut.project, clip, 0, createSequentialIdGenerator())
    expect(pasted.melody.some((m) => m.midi === clip.melody[0]!.midi)).toBe(true)

    expect(selectionIsEmpty(emptySelection())).toBe(true)
    expect(toggleId(['a'], 'a')).toEqual([])
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b'])
  })
})

describe('Project CRUD + UpdateMelody', () => {
  it('create/persist/load/delete', async () => {
    const repo = memoryRepo()
    const p = createProject('T', {
      idGen: createSequentialIdGenerator(),
      clock: createFixedClock(99),
    })
    await persistProjects([p], repo)
    expect((await loadProjects(repo))[0]!.createdAt).toBe(99)
    const left = await deleteProject(p.id, [p], repo)
    expect(left).toHaveLength(0)
  })

  it('delete falls back to saveAll when remove missing', async () => {
    let data: ArrangementProject[] = []
    const repo: ArrangementRepository = {
      async loadAll() {
        return data
      },
      async saveAll(projects) {
        data = [...projects]
      },
    }
    const a = createEmptyArrangement('A', { id: 'a' })
    const b = createEmptyArrangement('B', { id: 'b' })
    data = [a, b]
    const left = await deleteProject('a', data, repo)
    expect(left.map((x) => x.id)).toEqual(['b'])
  })

  it('upsert / remove melody and setProjectMeta', () => {
    let p = createEmptyArrangement('M', { id: 'a', now: 1 })
    const n: MelodyEvent = {
      id: 'm1',
      midi: 60,
      startTick: 0,
      durationTicks: 480,
      role: 'unknown',
    }
    p = upsertMelodyNote(p, n, { clock: createFixedClock(5) })
    expect(p.updatedAt).toBe(5)
    p = upsertMelodyNote(p, { ...n, midi: 62 })
    expect(p.melody[0]!.midi).toBe(62)
    p = removeMelodyNote(p, 'm1')
    expect(p.melody).toHaveLength(0)
    p = setProjectMeta(p, { title: 'Renamed', bpm: 120 }, createFixedClock(9))
    expect(p.title).toBe('Renamed')
    expect(p.bpm).toBe(120)
    expect(p.updatedAt).toBe(9)
  })
})

describe('Just intonation shades', () => {
  it('uses flatter third for m7 / half-dim vs minor', () => {
    const m7 = BARBERSHOP_CHORDS.find((c) => c.id === 'm7')!
    const minor = BARBERSHOP_CHORDS.find((c) => c.id === 'minor')!
    expect(roleCents(m7, 3)).toBeLessThan(roleCents(minor, 3))
  })

  it('justCentsForVoicing nulls bad inputs; equalLead zeros lead', () => {
    expect(
      justCentsForVoicing({ natureId: 'nope', voicing: '1537', rootPc: 0, leadMidi: 60 }),
    ).toBeNull()
    expect(
      justCentsForVoicing({ natureId: 'seventh', voicing: '13', rootPc: 0, leadMidi: 60 }),
    ).toBeNull()
    const cents = justCentsForVoicing({
      natureId: 'seventh',
      voicing: '1537',
      rootPc: 0,
      leadMidi: 64,
      equalLead: true,
    })
    expect(cents?.lead).toBe(0)
  })

  it('shades altered fifths when present', () => {
    const aug = BARBERSHOP_CHORDS.find((c) => c.id === 'aug')!
    const dim = BARBERSHOP_CHORDS.find((c) => c.id === 'dim')!
    expect(roleCents(aug, 5)).not.toBe(0)
    expect(roleCents(dim, 5)).not.toBe(0)
  })
})


describe('Composition + system services', () => {
  it('createArrangingServices wires musicXmlExporter', () => {
    setArrangingServicesForTests(null)
    const s = createArrangingServices({
      idGen: createSequentialIdGenerator(),
      clock: createFixedClock(1),
      repository: createMemoryRepository(),
    })
    expect(s.musicXmlExporter.export(phrase())).toContain('score-partwise')
    expect(createBrowserIdGenerator().next('x')).toMatch(/^x_/)
    expect(createSystemClock().now()).toBeTypeOf('number')
    setArrangingServicesForTests(null)
  })

  it('memory repository round-trip', async () => {
    const repo = createMemoryRepository()
    const p = createEmptyArrangement('LS', { id: 'ls1' })
    await repo.saveAll([p])
    const loaded = await repo.loadAll()
    expect(loaded[0]?.title).toBe('LS')
  })
})

describe('placeVoicing null paths', () => {
  it('returns null for incomplete voicing string', () => {
    const chord = BARBERSHOP_CHORDS[0]!
    expect(placeVoicing({ chord, rootPc: 0, leadMidi: 60, voicing: '15' })).toBeNull()
  })
})
