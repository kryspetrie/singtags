/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from '../../domain/arranging/types'
import {
  migratePillarsToSketchIfEmpty,
  mergeCoachSessionFromExisting,
} from './mergeCoachSession'

describe('mergeCoachSessionFromExisting', () => {
  it('re-seeds pillars from locked sketch (stale session does not win)', () => {
    const fresh = createEmptyArrangement('f')
    fresh.pillars = [
      {
        id: 'from_sketch',
        rootPc: 7,
        startTick: 0,
        endTick: 480,
        source: 'user',
        confirmed: true,
      },
    ]
    const existing = createEmptyArrangement('e')
    existing.pillars = [
      {
        id: 'stale',
        rootPc: 0,
        startTick: 0,
        endTick: 1920,
        source: 'user',
        confirmed: true,
      },
    ]
    mergeCoachSessionFromExisting(fresh, existing, {
      harmonySketch: [
        {
          id: 'hs1',
          startTick: 0,
          endTick: 480,
          rootPc: 7,
          quality: 'seventh',
          source: 'user',
          locked: true,
        },
      ],
      nextId: (p) => `${p}_n`,
    })
    expect(fresh.pillars).toHaveLength(1)
    expect(fresh.pillars[0]).toMatchObject({ rootPc: 7, startTick: 0, endTick: 480 })
  })

  it('keeps existing pillars when sketch is empty', () => {
    const fresh = createEmptyArrangement('f')
    const existing = createEmptyArrangement('e')
    existing.pillars = [
      {
        id: 'keep',
        rootPc: 5,
        startTick: 0,
        endTick: 480,
        source: 'user',
        confirmed: true,
      },
    ]
    mergeCoachSessionFromExisting(fresh, existing, { harmonySketch: [] })
    expect(fresh.pillars[0]?.id).toBe('keep')
  })
})

describe('migratePillarsToSketchIfEmpty', () => {
  it('writes pillars into empty sketch once', () => {
    const out = migratePillarsToSketchIfEmpty([], [
      {
        id: 'p1',
        rootPc: 0,
        startTick: 0,
        endTick: 480,
        source: 'user',
        confirmed: true,
      },
    ])
    expect(out).toEqual([
      expect.objectContaining({ rootPc: 0, quality: 'major', locked: true, source: 'coach' }),
    ])
  })

  it('does not promote unconfirmed draft pillars into Declared', () => {
    expect(
      migratePillarsToSketchIfEmpty([], [
        {
          id: 'draft',
          rootPc: 0,
          startTick: 0,
          endTick: 480,
          source: 'inferred',
          confirmed: false,
        },
      ]),
    ).toEqual([])
  })

  it('does not overwrite locked sketch', () => {
    const sketch = [
      {
        id: 'hs',
        startTick: 0,
        endTick: 100,
        rootPc: 7,
        quality: 'seventh' as const,
        source: 'user' as const,
        locked: true,
      },
    ]
    expect(
      migratePillarsToSketchIfEmpty(sketch, [
        {
          id: 'p1',
          rootPc: 0,
          startTick: 0,
          endTick: 480,
          source: 'user',
          confirmed: true,
        },
      ]),
    ).toEqual(sketch)
  })
})
