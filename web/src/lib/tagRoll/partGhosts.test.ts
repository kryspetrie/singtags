import { describe, expect, it } from 'vitest'
import { focusPartGhosts } from './partGhosts'
import { TAG_ROLL_DEFAULT_VIEW } from './types'

describe('focusPartGhosts', () => {
  const base = {
    parts: [
      { id: 'a', name: 'Lead', color: '#111', midiGroup: 'upper' as const },
      { id: 'b', name: 'Bass', color: '#222', midiGroup: 'lower' as const },
    ],
    notes: [
      { id: 'n1', partId: 'a', midi: 60, startTick: 0, durationTicks: 120 },
      { id: 'n2', partId: 'b', midi: 48, startTick: 0, durationTicks: 120 },
    ],
    view: { ...TAG_ROLL_DEFAULT_VIEW, activePartId: 'a', focusActivePart: true },
  }

  it('returns other-part notes when focus is on', () => {
    const ghosts = focusPartGhosts(base)
    expect(ghosts).toHaveLength(1)
    expect(ghosts[0]?.partId).toBe('b')
    expect(ghosts[0]?.color).toBe('#222')
  })

  it('returns empty when focus is off', () => {
    expect(
      focusPartGhosts({
        ...base,
        view: { ...base.view, focusActivePart: false },
      }),
    ).toEqual([])
  })
})
