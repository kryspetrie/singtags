import { describe, expect, it } from 'vitest'
import { applyRoleLabels, labelMelodyRoles } from './melodyRoles'
import type { MelodyEvent, Pillar } from './types'

describe('melodyRoles', () => {
  it('labels beat-aligned long notes as PMN', () => {
    const melody: MelodyEvent[] = [
      { id: 'a', midi: 60, startTick: 0, durationTicks: 480, role: 'unknown' },
      { id: 'b', midi: 62, startTick: 240, durationTicks: 120, role: 'unknown' },
      { id: 'c', midi: 64, startTick: 480, durationTicks: 480, role: 'unknown' },
    ]
    const pillars: Pillar[] = [
      {
        id: 'p',
        rootPc: 0,
        startTick: 0,
        endTick: 2000,
        source: 'user',
        confirmed: true,
      },
    ]
    const labels = labelMelodyRoles({ melody, pillars, force: true })
    expect(labels.find((l) => l.id === 'a')?.role).toBe('pmn')
    expect(labels.find((l) => l.id === 'b')?.role).toBe('smn')
    const applied = applyRoleLabels(melody, labels)
    expect(applied[0]!.role).toBe('pmn')
  })

  it('preserves non-unknown roles unless force', () => {
    const melody: MelodyEvent[] = [
      { id: 'a', midi: 60, startTick: 0, durationTicks: 480, role: 'smn' },
    ]
    const labels = labelMelodyRoles({ melody, force: false })
    expect(labels[0]!.role).toBe('smn')
    expect(labels[0]!.reason).toBe('user/kept')
  })
})
