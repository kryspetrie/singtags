/**
 * Edge cases, adversarial inputs, and no-throw fuzz over random short melodies.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyArrangement, type ArrangementProject, type ChordStack } from './types'
import { autoHarmonizeMelody, generateCandidates, candidatesForMelodyNote } from './harmonize'
import { lintArrangement, createFixRegistry } from './qa'
import { suggestPillars, pillarAtTick, suggestionsToPillars } from './pillars'
import { analyzeVoiceLeading } from './voiceLeading'
import { syncStackAfterMelodyEdit } from './syncStacks'
import { strengthenStacks } from './strengthen'
import { copySelection, cutSelection, pasteClipboard } from './clipboard'
import { selectOnlyMelody, selectOnlyStacks, emptySelection } from './selection'
import { arrangementToTagRoll, tagRollToArrangement } from './bridge/tagRollBridge'
import { projectToScoreModel } from './musicxml/projectToScoreModel'
import { scoreModelToMusicXml } from '../../adapters/arranging/musicxml/arrangementMusicXmlExporter'
import { exportMusicXml } from '../../application/arranging/ExportMusicXml'
import { createArrangementMusicXmlExporter } from '../../adapters/arranging/musicxml/createMusicXmlExporter'
import { exportArrangementMidi } from '../../adapters/arranging/midi/arrangementMidiExporter'
import { placeVoicing, BARBERSHOP_CHORDS } from './chords'
import { assessFinalReadiness } from './finalChecklist'
import { findEmbellishmentSeeds, applyEmbellishmentSeed, melodyWithLyric } from './embellishments'
import { polishVoicings } from './polishVoicing'

function stack(partial: Partial<ChordStack> & { midi: NonNullable<ChordStack['midi']> }): ChordStack {
  return {
    id: partial.id ?? 's',
    startTick: partial.startTick ?? 0,
    durationTicks: partial.durationTicks ?? 480,
    rootPc: partial.rootPc ?? 0,
    natureId: partial.natureId ?? 'major',
    voicing: partial.voicing ?? '1513',
    spread: false,
    layer: partial.layer ?? 'primary',
    scfGroup: null,
    pillarId: null,
    midi: partial.midi,
    ruleTags: [],
  }
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('empty / degenerate projects', () => {
  it('lint empty project is only no-melody', () => {
    const lints = lintArrangement(createEmptyArrangement())
    expect(lints.some((l) => l.ruleId === 'no-melody')).toBe(true)
  })

  it('autoHarmonize with no pillars yields no stacks', () => {
    const melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' as const }]
    expect(autoHarmonizeMelody({ melody, pillars: [], tonality: 0 })).toEqual([])
  })

  it('suggestPillars empty melody is []', () => {
    expect(suggestPillars({ melody: [], tonality: 0 })).toEqual([])
  })

  it('clipboard empty selection is null', () => {
    const p = createEmptyArrangement()
    expect(copySelection(p, emptySelection())).toBeNull()
    expect(cutSelection(p, emptySelection())).toBeNull()
  })

  it('analyzeVoiceLeading empty / null midi is quiet', () => {
    expect(analyzeVoiceLeading([])).toEqual([])
    expect(
      analyzeVoiceLeading([
        { ...stack({ midi: { bass: 48, bari: 52, lead: 60, tenor: 67 } }), midi: null },
      ]),
    ).toEqual([])
  })
})

describe('extreme MIDI and tick boundaries', () => {
  it.each([36, 48, 50, 77, 83, 84, 96])('lead midi %i does not throw in generate', (midi) => {
    expect(() =>
      generateCandidates({
        note: { id: 'n', midi, startTick: 0, durationTicks: 120, role: 'pmn' },
        pillar: {
          id: 'p',
          rootPc: 0,
          startTick: 0,
          endTick: 1000,
          source: 'user',
          confirmed: true,
        },
        tonality: 0,
        prevRootPc: null,
      }),
    ).not.toThrow()
  })

  it.each([1, 60, 120, 240, 480, 960, 1920, 3840])(
    'durationTicks %i accepted by autoHarmonize',
    (dur) => {
      const melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: dur, role: 'pmn' as const }]
      const pillars = [
        { id: 'p', rootPc: 0, startTick: 0, endTick: dur + 1, source: 'user' as const, confirmed: true },
      ]
      expect(() =>
        autoHarmonizeMelody({ melody, pillars, tonality: 0 }),
      ).not.toThrow()
    },
  )

  it('pillarAtTick boundaries', () => {
    const pillars = suggestionsToPillars([
      { rootPc: 0, startTick: 0, endTick: 1920, confidence: 1, reason: 't' },
    ])
    expect(pillarAtTick(pillars, 0)?.rootPc).toBe(0)
    expect(pillarAtTick(pillars, 1919)?.rootPc).toBe(0)
    expect(pillarAtTick(pillars, 1920)).toBeNull()
    expect(pillarAtTick(pillars, -1)).toBeNull()
  })
})

describe('overlapping / orphan / embellishment stacks', () => {
  it('orphan stack is lint error and fixable', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 480, source: 'user', confirmed: true },
    ]
    p.stacks = [
      stack({ id: 'ok', startTick: 0, midi: { bass: 48, bari: 52, lead: 60, tenor: 67 } }),
      stack({ id: 'bad', startTick: 5000, midi: { bass: 48, bari: 52, lead: 60, tenor: 67 } }),
    ]
    const lint = lintArrangement(p).find((l) => l.ruleId === 'orphan-stack')
    expect(lint).toBeTruthy()
    const next = createFixRegistry().applyToProject(lint!, p)
    expect(next!.stacks.every((s) => s.id !== 'bad')).toBe(true)
  })

  it('two stacks same onset: lint still runs', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 480, source: 'user', confirmed: true },
    ]
    p.stacks = [
      stack({ id: 'a', startTick: 0, midi: { bass: 48, bari: 52, lead: 60, tenor: 67 } }),
      stack({ id: 'b', startTick: 0, midi: { bass: 43, bari: 50, lead: 60, tenor: 64 } }),
    ]
    expect(() => lintArrangement(p)).not.toThrow()
  })
})

describe('syncStacks edge paths', () => {
  it('no-op when pitch and timing unchanged', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 2000, source: 'user', confirmed: true },
    ]
    p.stacks = autoHarmonizeMelody({
      melody: p.melody,
      pillars: p.pillars,
      tonality: 0,
    })
    const n = p.melody[0]!
    const stacks = syncStackAfterMelodyEdit(p, n, n)
    expect(stacks).toEqual(p.stacks)
  })

  it('missing stack returns original stacks', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.stacks = []
    const n = p.melody[0]!
    expect(syncStackAfterMelodyEdit(p, n, { ...n, midi: 64 })).toEqual([])
  })
})

describe('clipboard iterations', () => {
  it.each([0, 240, 480, 960, 1920])('paste at tick %i rebases', (at) => {
    let p = createEmptyArrangement()
    p.melody = [
      { id: 'm1', midi: 60, startTick: 480, durationTicks: 240, role: 'pmn' },
      { id: 'm2', midi: 64, startTick: 720, durationTicks: 240, role: 'pmn' },
    ]
    const clip = copySelection(p, selectOnlyMelody(['m1', 'm2']))!
    const out = pasteClipboard(p, clip, at, { next: (x) => `${x}_${at}` })
    expect(out.melody.filter((m) => m.startTick >= at).length).toBeGreaterThanOrEqual(2)
  })

  it('cut then paste restores count', () => {
    let p = createEmptyArrangement()
    p.stacks = [
      stack({ id: 's1', startTick: 0, midi: { bass: 48, bari: 52, lead: 60, tenor: 67 } }),
    ]
    const cut = cutSelection(p, selectOnlyStacks(['s1']))!
    expect(cut.project.stacks).toHaveLength(0)
    const back = pasteClipboard(cut.project, cut.clipboard, 0, { next: (x) => `${x}_r` })
    expect(back.stacks).toHaveLength(1)
  })
})

describe('TagRoll bridge + MusicXML edge iterations', () => {
  it.each([
    { title: '', bpm: 0, preferFlats: false },
    { title: 'A & B <C>', bpm: 40, preferFlats: true },
    { title: '日本語', bpm: 200, preferFlats: false },
  ])('bridge+xml for meta %#', (meta) => {
    let n = 0
    const idGen = { next: (p: string) => `${p}_${++n}` }
    const p = createEmptyArrangement(meta.title || 'x')
    p.bpm = meta.bpm || 100
    p.preferFlats = meta.preferFlats
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn', lyric: 'La' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 1000, source: 'user', confirmed: true },
    ]
    p.stacks = autoHarmonizeMelody({
      melody: p.melody,
      pillars: p.pillars,
      tonality: 0,
    })
    const tag = arrangementToTagRoll(p, idGen)
    let m = 0
    const back = tagRollToArrangement(tag, { next: (x) => `${x}_b${++m}` })
    expect(back.melody[0]?.midi).toBe(60)
    for (const layout of ['ttbb', 'perPart'] as const) {
      const xml = scoreModelToMusicXml(projectToScoreModel(p, layout))
      expect(xml).toContain('score-partwise')
      expect(xml.length).toBeGreaterThan(100)
      if (meta.title.includes('&')) expect(xml).toContain('&amp;')
      if (meta.title.includes('<')) expect(xml).toContain('&lt;')
    }
    expect(exportMusicXml(p, createArrangementMusicXmlExporter()).ok).toBe(true)
    expect(exportArrangementMidi(p, { justIntonation: true }).length).toBeGreaterThan(50)
  })

  it('melody-only project exports MusicXML', () => {
    const p = createEmptyArrangement('solo')
    p.melody = [
      { id: 'm1', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
      { id: 'm2', midi: 62, startTick: 480, durationTicks: 480, role: 'pmn' },
    ]
    const xml = createArrangementMusicXmlExporter().export(p, { layout: 'ttbb' })
    expect(xml).toContain('measure')
  })
})

describe('seeded fuzz: random short melodies never throw', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])(
    'seed %i',
    (seed) => {
      const rnd = mulberry32(seed * 997)
      const n = 2 + Math.floor(rnd() * 10)
      const melody = Array.from({ length: n }, (_, i) => ({
        id: `m${i}`,
        midi: 50 + Math.floor(rnd() * 28),
        startTick: i * (120 + Math.floor(rnd() * 480)),
        durationTicks: 120 + Math.floor(rnd() * 480),
        role: (rnd() > 0.5 ? 'pmn' : 'smn') as const,
      }))
      const tonality = Math.floor(rnd() * 12)
      const pillars = [
        {
          id: 'p',
          rootPc: tonality,
          startTick: 0,
          endTick: 100000,
          source: 'user' as const,
          confirmed: true,
        },
      ]
      const profile = (['sai11', 'bhs_extended', 'learning'] as const)[
        Math.floor(rnd() * 3)
      ]!
      expect(() => {
        const stacks = autoHarmonizeMelody({
          melody,
          pillars,
          tonality,
          profile,
          preferScfForSmn: true,
        })
        const p: ArrangementProject = {
          ...createEmptyArrangement(`fuzz-${seed}`),
          tonality,
          contestProfile: profile,
          melody,
          pillars,
          stacks,
        }
        lintArrangement(p)
        strengthenStacks(p)
        polishVoicings(p)
        assessFinalReadiness(p)
        findEmbellishmentSeeds(p)
        arrangementToTagRoll(p, { next: (x) => `${x}_${seed}` })
        createArrangementMusicXmlExporter().export(p)
        exportArrangementMidi(p)
        if (stacks[0]) {
          candidatesForMelodyNote({
            note: melody[0]!,
            pillar: pillars[0]!,
            tonality,
            prevRootPc: null,
            preferScf: true,
            limit: 8,
            profile,
          })
        }
      }).not.toThrow()
    },
  )
})

describe('embellishment + lyrics edges', () => {
  it('apply without suggestedStack is identity', () => {
    const p = createEmptyArrangement()
    const next = applyEmbellishmentSeed(p, {
      id: 'x',
      kind: 'tag_hint',
      noteId: 'n',
      message: 'x',
    })
    expect(next).toEqual(p)
  })

  it.each(['', 'Oh', 'multi word', '♪'])('melodyWithLyric %j', (lyric) => {
    const melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' as const }]
    const out = melodyWithLyric(melody, 'm', lyric)
    expect(out[0]!.lyric).toBe(lyric)
  })
})

describe('placeVoicing rejects garbage', () => {
  it.each(['', '1', '12', '123', 'abcd', '9999'])('voicing %j → null', (voicing) => {
    const chord = BARBERSHOP_CHORDS[0]!
    expect(placeVoicing({ chord, rootPc: 0, leadMidi: 60, voicing })).toBeNull()
  })
})
