/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createSequentialIdGenerator } from '../../adapters/arranging/persistence/systemServices'
import { createEmptyArrangement } from '../../domain/arranging/types'
import {
  applyCandidateToProject,
  listCandidatesForNote,
  resolveSuggestHomeRoot,
} from './AutoHarmonize'

function noteAt(midi: number, startTick = 0) {
  return {
    id: 'm1',
    midi,
    startTick,
    durationTicks: 480,
    role: 'pmn' as const,
  }
}

describe('resolveSuggestHomeRoot', () => {
  it('prefers a real pillar over sketch / implied', () => {
    const note = noteAt(60)
    const pillar = {
      id: 'pil1',
      rootPc: 7,
      startTick: 0,
      endTick: 960,
      source: 'user' as const,
      confirmed: true,
    }
    const r = resolveSuggestHomeRoot({
      note,
      pillars: [pillar],
      soft: {
        sketchSpans: [{ startTick: 0, endTick: 960, rootPc: 0, locked: true }],
      },
      tonality: 0,
    })
    expect(r?.source).toBe('pillar')
    expect(r?.pillar.id).toBe('pil1')
    expect(r?.ephemeral).toBe(false)
  })

  it('uses locked Sketch when no pillar covers the onset', () => {
    const note = noteAt(64, 480)
    const r = resolveSuggestHomeRoot({
      note,
      pillars: [],
      soft: {
        sketchSpans: [{ startTick: 480, endTick: 960, rootPc: 5, locked: true }],
      },
      tonality: 0,
    })
    expect(r?.source).toBe('sketch')
    expect(r?.pillar.rootPc).toBe(5)
    expect(r?.ephemeral).toBe(true)
  })

  it('ignores unlocked Sketch and falls through to Detected', () => {
    const note = noteAt(60)
    const r = resolveSuggestHomeRoot({
      note,
      pillars: [],
      soft: {
        sketchSpans: [{ startTick: 0, endTick: 480, rootPc: 0, locked: false }],
        detectedSpans: [{ startTick: 0, endTick: 480, rootPc: 2 }],
      },
      tonality: 0,
    })
    expect(r?.source).toBe('detected')
    expect(r?.pillar.rootPc).toBe(2)
  })

  it('falls back to implied melody chord', () => {
    const note = noteAt(60)
    const r = resolveSuggestHomeRoot({
      note,
      pillars: [],
      tonality: 0,
      mode: 'major',
    })
    expect(r?.source).toBe('implied')
    expect(r?.pillar.rootPc).toBeTypeOf('number')
    expect(r?.ephemeral).toBe(true)
  })
})

describe('listCandidatesForNote soft context', () => {
  it('returns candidates without pillars via implied fallback', () => {
    const p = createEmptyArrangement()
    p.tonality = 0
    p.melody = [noteAt(60)]
    const cands = listCandidatesForNote(p, p.melody[0]!, { limit: 8 })
    expect(cands.length).toBeGreaterThan(0)
  })

  it('returns candidates from locked Sketch soft context', () => {
    const p = createEmptyArrangement()
    p.tonality = 0
    p.melody = [noteAt(60)]
    const cands = listCandidatesForNote(p, p.melody[0]!, {
      limit: 8,
      softContext: {
        sketchSpans: [{ startTick: 0, endTick: 480, rootPc: 0, locked: true }],
      },
    })
    expect(cands.length).toBeGreaterThan(0)
  })

  it('applyCandidateToProject stores null pillarId under soft (no real pillar)', () => {
    const p = createEmptyArrangement()
    p.tonality = 0
    const note = noteAt(60)
    p.melody = [note]
    const cands = listCandidatesForNote(p, note, { limit: 4 })
    expect(cands[0]).toBeTruthy()
    const next = applyCandidateToProject(p, note, cands[0]!, {
      idGen: createSequentialIdGenerator(),
    })
    const at = next.stacks.find((s) => s.startTick === note.startTick)
    expect(at?.pillarId).toBeNull()
    expect(at?.midi?.lead).toBe(note.midi)
  })

  it('still prefers real pillar when present', () => {
    const p = createEmptyArrangement()
    p.tonality = 0
    const note = noteAt(60)
    p.melody = [note]
    p.pillars = [
      {
        id: 'pil-real',
        rootPc: 0,
        startTick: 0,
        endTick: 960,
        source: 'user',
        confirmed: true,
      },
    ]
    const cands = listCandidatesForNote(p, note, {
      limit: 8,
      softContext: {
        sketchSpans: [{ startTick: 0, endTick: 480, rootPc: 7, locked: true }],
      },
    })
    expect(cands.length).toBeGreaterThan(0)
    const next = applyCandidateToProject(p, note, cands[0]!, {
      idGen: createSequentialIdGenerator(),
    })
    expect(next.stacks.find((s) => s.startTick === 0)?.pillarId).toBe('pil-real')
  })
})
