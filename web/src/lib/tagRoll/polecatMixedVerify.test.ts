/**
 * Automated verification against published mixed-polecat MusicXML seeds.
 * Pilot: Irish Rose (90001), Sweetheart (90006), Mill Stream (90011).
 *
 * @vitest-environment happy-dom
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createSequentialIdGenerator } from '../../adapters/system/systemServices'
import { identifyNatureFromMidi } from '../../domain/arranging/chordCompletion'
import { completeFromPartsToNotes } from './completeFromParts'
import { normalizeTagRollProject } from './normalize'
import type { TagRollProject } from './types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SEED_DIR = resolve(__dirname, '../../../public/tag-studio/polecat-mixed-seeds')

const PILOTS = [90001, 90006, 90011] as const

function loadSeed(tagId: number): TagRollProject {
  const raw = JSON.parse(readFileSync(resolve(SEED_DIR, `${tagId}.json`), 'utf8'))
  const p = normalizeTagRollProject(raw)
  if (!p) throw new Error(`bad seed ${tagId}`)
  return p
}

function partId(project: TagRollProject, name: string): string {
  const p = project.parts.find((x) => x.name === name)
  if (!p) throw new Error(`missing part ${name}`)
  return p.id
}

function covering(
  project: TagRollProject,
  partName: string,
  tick: number,
): number | null {
  const id = partId(project, partName)
  const n =
    project.notes.find((x) => x.partId === id && x.startTick === tick) ??
    project.notes.find(
      (x) =>
        x.partId === id &&
        x.startTick <= tick &&
        tick < x.startTick + x.durationTicks,
    )
  return n?.midi ?? null
}

describe('polecat mixed seed verification', () => {
  it.each(PILOTS)('seed %i has TTBB and identifiable first stacks', (tagId) => {
    const project = loadSeed(tagId)
    expect(project.parts.map((p) => p.name).slice(0, 4)).toEqual([
      'Tenor',
      'Lead',
      'Bari',
      'Bass',
    ])
    const leadId = partId(project, 'Lead')
    const melody = project.notes
      .filter((n) => n.partId === leadId)
      .sort((a, b) => a.startTick - b.startTick)
    expect(melody.length).toBeGreaterThan(8)

    let identified = 0
    for (const m of melody.slice(0, 24)) {
      const midi = {
        lead: m.midi,
        ...(covering(project, 'Tenor', m.startTick) != null
          ? { tenor: covering(project, 'Tenor', m.startTick)! }
          : {}),
        ...(covering(project, 'Bari', m.startTick) != null
          ? { bari: covering(project, 'Bari', m.startTick)! }
          : {}),
        ...(covering(project, 'Bass', m.startTick) != null
          ? { bass: covering(project, 'Bass', m.startTick)! }
          : {}),
      }
      const partsPresent = ['tenor', 'bari', 'bass'].filter(
        (k) => (midi as Record<string, number | undefined>)[k] != null,
      ).length
      if (partsPresent < 1) continue
      const id = identifyNatureFromMidi({
        midi,
        profile: 'sai11',
        tonality: project.tonality,
      })
      if (id && id.natureId !== 'unknown') identified++
    }
    expect(identified).toBeGreaterThan(3)
  })

  it('Fill parts restores emptied TBB while preserving Bass (Irish Rose)', () => {
    const project = loadSeed(90001)
    const leadId = partId(project, 'Lead')
    const tenorId = partId(project, 'Tenor')
    const bariId = partId(project, 'Bari')
    const bassId = partId(project, 'Bass')

    const melody = project.notes
      .filter((n) => n.partId === leadId)
      .sort((a, b) => a.startTick - b.startTick)

    // First phrase window: first 8 melody onsets that have Bass covering.
    const windowEnd =
      melody.find((m, i) => i >= 7 && covering(project, 'Bass', m.startTick) != null)
        ?.startTick ?? melody[7]!.startTick
    const rangeEnd = windowEnd + (melody.find((m) => m.startTick === windowEnd)?.durationTicks ?? 480)

    const bassBefore = new Map<number, number>()
    for (const m of melody) {
      if (m.startTick >= rangeEnd) break
      const b = covering(project, 'Bass', m.startTick)
      if (b != null) bassBefore.set(m.startTick, b)
    }
    expect(bassBefore.size).toBeGreaterThan(2)

    // Strip Tenor + Bari in the window (keep notes that start at/after rangeEnd).
    const stripped: TagRollProject = {
      ...project,
      notes: project.notes.filter((n) => {
        if (n.partId !== tenorId && n.partId !== bariId) return true
        return n.startTick >= rangeEnd
      }),
      harmonySketch: [],
    }

    const result = completeFromPartsToNotes({
      project: stripped,
      range: [{ startTick: 0, endTick: rangeEnd }],
      profile: 'sai11',
      idGen: createSequentialIdGenerator(1),
    })

    expect(result.filled + result.locked + result.skipped).toBeGreaterThan(0)
    expect(result.filled).toBeGreaterThan(0)

    for (const [tick, midi] of bassBefore) {
      const after = result.notes.find(
        (n) =>
          n.partId === bassId &&
          n.startTick <= tick &&
          tick < n.startTick + n.durationTicks,
      )
      expect(after?.midi, `bass @ ${tick}`).toBe(midi)
    }
    // At least one Tenor or Bari note written back in the window.
    const restored = result.notes.filter(
      (n) =>
        (n.partId === tenorId || n.partId === bariId) &&
        n.startTick < rangeEnd,
    )
    expect(restored.length).toBeGreaterThan(0)
  })

  it('Detected-only Fill locks Sketch without inventing TTBB (Irish Rose melody)', () => {
    const project = loadSeed(90001)
    const leadId = partId(project, 'Lead')
    const melody = project.notes.filter((n) => n.partId === leadId)
    const first = melody.sort((a, b) => a.startTick - b.startTick)[0]!
    const end = first.startTick + first.durationTicks
    const melodyOnly: TagRollProject = {
      ...project,
      notes: melody.filter((n) => n.startTick < end + 1),
      harmonySketch: [],
    }
    const result = completeFromPartsToNotes({
      project: melodyOnly,
      detectHoles: [
        {
          id: 'd1',
          startTick: first.startTick,
          endTick: end,
          rootPc: project.tonality,
          quality: 'major',
        },
      ],
      range: [{ startTick: first.startTick, endTick: end }],
      profile: 'sai11',
      idGen: createSequentialIdGenerator(1),
    })
    expect(result.locked).toBe(1)
    expect(result.filled).toBe(0)
    expect(result.notes.every((n) => n.partId === leadId)).toBe(true)
    expect(result.sketch.some((s) => s.locked)).toBe(true)
  })
})
