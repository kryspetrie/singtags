/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import type { MelodyEvent, Pillar } from './types'
import {
  candidatePillarPositions,
  nextHomeRootProposal,
  proposeRootForSpan,
} from './proposePillarAt'

function mel(id: string, start: number, midi = 60, role: MelodyEvent['role'] = 'pmn'): MelodyEvent {
  return { id, midi, startTick: start, durationTicks: 480, role }
}

describe('proposePillarAt', () => {
  it('proposeRootForSpan prefers tonic under C major tones', () => {
    const root = proposeRootForSpan({
      melody: [mel('a', 0, 60), mel('b', 480, 64), mel('c', 960, 67)],
      startTick: 0,
      endTick: 1920,
      tonality: 0,
      mode: 'major',
    })
    expect(root?.rootPc).toBe(0)
  })

  it('nextHomeRootProposal returns one span then none after a locked pillar covers it', () => {
    const melody = [mel('a', 0), mel('b', 1920), mel('c', 3840)]
    const first = nextHomeRootProposal({
      melody,
      pillars: [],
      tonality: 0,
      cursorTick: 0,
      measureTicks: 1920,
    })
    expect(first).not.toBeNull()
    expect(first!.startTick).toBe(0)

    const locked: Pillar[] = [
      {
        id: 'p1',
        rootPc: first!.rootPc,
        startTick: first!.startTick,
        endTick: first!.endTick,
        source: 'user',
        confirmed: true,
      },
    ]
    const second = nextHomeRootProposal({
      melody,
      pillars: locked,
      tonality: 0,
      cursorTick: first!.endTick,
      measureTicks: 1920,
    })
    expect(second).not.toBeNull()
    expect(second!.startTick).toBeGreaterThanOrEqual(first!.endTick)
  })

  it('nextHomeRootProposal skips session-skipped spans', () => {
    const melody = [mel('a', 0), mel('b', 1920)]
    const first = nextHomeRootProposal({
      melody,
      pillars: [],
      tonality: 0,
      cursorTick: 0,
      measureTicks: 1920,
    })
    expect(first).not.toBeNull()
    const skipped = [`${first!.startTick}:${first!.endTick}`]
    const second = nextHomeRootProposal({
      melody,
      pillars: [],
      tonality: 0,
      cursorTick: 0,
      measureTicks: 1920,
      skippedSpans: skipped,
    })
    expect(second).not.toBeNull()
    expect(second!.startTick).not.toBe(first!.startTick)
  })

  it('candidatePillarPositions prefers Strong→Strong spans when labeled', () => {
    const melody = [
      mel('a', 0, 60, 'pmn'),
      mel('b', 480, 62, 'smn'),
      mel('c', 960, 64, 'pmn'),
      mel('d', 1920, 65, 'pmn'),
    ]
    const pos = candidatePillarPositions({
      melody,
      pillars: [],
      measureTicks: 1920,
      cursorTick: 0,
    })
    const phrase = pos.find((p) => p.kind === 'uncovered' && p.startTick === 0)
    expect(phrase?.endTick).toBe(960)
  })

  it('candidatePillarPositions skips fully locked measures', () => {
    const melody = [mel('a', 0), mel('b', 1920)]
    const pillars: Pillar[] = [
      {
        id: 'p',
        rootPc: 0,
        startTick: 0,
        endTick: 1920,
        source: 'user',
        confirmed: true,
      },
    ]
    const pos = candidatePillarPositions({
      melody,
      pillars,
      measureTicks: 1920,
      cursorTick: 0,
    })
    expect(pos.every((p) => p.startTick >= 1920)).toBe(true)
  })
})
