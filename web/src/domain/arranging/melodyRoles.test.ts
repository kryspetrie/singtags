import { describe, expect, it } from 'vitest'
import { applyRoleLabels, assignMelodyRoles, labelMelodyRoles } from './melodyRoles'
import type { MelodyEvent, Pillar } from './types'

describe('melodyRoles', () => {
  it('assignMelodyRoles marks beat-aligned long notes as Strong (pmn)', () => {
    const melody: MelodyEvent[] = [
      { id: 'a', midi: 60, startTick: 0, durationTicks: 480, role: 'unknown' },
      { id: 'b', midi: 62, startTick: 240, durationTicks: 120, role: 'unknown' },
      { id: 'c', midi: 64, startTick: 480, durationTicks: 480, role: 'unknown' },
    ]
    const applied = assignMelodyRoles(melody, { ppq: 480 })
    expect(applied.find((n) => n.id === 'a')?.role).toBe('pmn')
    expect(applied.find((n) => n.id === 'b')?.role).toBe('smn')
    expect(applied.find((n) => n.id === 'c')?.role).toBe('pmn')
  })

  it('labels phrase edges Strong even when short', () => {
    const melody: MelodyEvent[] = [
      { id: 'a', midi: 67, startTick: 0, durationTicks: 240, role: 'unknown' },
      { id: 'b', midi: 69, startTick: 240, durationTicks: 120, role: 'unknown' },
      { id: 'c', midi: 71, startTick: 360, durationTicks: 120, role: 'unknown' },
      // gap > 1.5 beat → new phrase
      { id: 'd', midi: 72, startTick: 2000, durationTicks: 240, role: 'unknown' },
      { id: 'e', midi: 71, startTick: 2240, durationTicks: 120, role: 'unknown' },
    ]
    const labels = labelMelodyRoles({ melody, force: true, meter: { ppq: 480 } })
    expect(labels.find((l) => l.id === 'a')?.role).toBe('pmn')
    expect(labels.find((l) => l.id === 'c')?.role).toBe('pmn')
    expect(labels.find((l) => l.id === 'd')?.role).toBe('pmn')
    expect(labels.find((l) => l.id === 'e')?.role).toBe('pmn')
    expect(labels.find((l) => l.id === 'b')?.role).toBe('smn')
  })

  it('labels beat-aligned long notes as PMN (with optional pillars)', () => {
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

  it('polecat-like contour: downs and longs Strong, stepwise eighths Passing', () => {
    // Rough "My Bonnie"-ish: quarter homes with eighth neighbors
    const melody: MelodyEvent[] = [
      { id: 'm0', midi: 67, startTick: 0, durationTicks: 480, role: 'unknown' },
      { id: 'm1', midi: 69, startTick: 480, durationTicks: 240, role: 'unknown' },
      { id: 'm2', midi: 71, startTick: 720, durationTicks: 240, role: 'unknown' },
      { id: 'm3', midi: 72, startTick: 960, durationTicks: 480, role: 'unknown' },
      { id: 'm4', midi: 71, startTick: 1440, durationTicks: 240, role: 'unknown' },
      { id: 'm5', midi: 69, startTick: 1680, durationTicks: 240, role: 'unknown' },
      { id: 'm6', midi: 67, startTick: 1920, durationTicks: 960, role: 'unknown' },
    ]
    const out = assignMelodyRoles(melody, { ppq: 480, beatsPerBar: 4 })
    expect(out.find((n) => n.id === 'm0')?.role).toBe('pmn')
    // Mid-bar quarter in a scale run may be Passing; downbeat/long/end stay Strong
    expect(out.find((n) => n.id === 'm6')?.role).toBe('pmn')
    expect(out.find((n) => n.id === 'm1')?.role).toBe('smn')
    expect(out.find((n) => n.id === 'm2')?.role).toBe('smn')
    expect(out.find((n) => n.id === 'm4')?.role).toBe('smn')
    expect(out.find((n) => n.id === 'm5')?.role).toBe('smn')
    const strongIds = out.filter((n) => n.role === 'pmn').map((n) => n.id)
    expect(strongIds).toContain('m0')
    expect(strongIds.length).toBeLessThan(melody.length)
  })

  it('coverage promote lifts half-bar homes capped per bar', () => {
    const ppq = 480
    // Same-degree quarters (no change-point flips) with mid-bar holds longer than neighbors.
    const melody: MelodyEvent[] = [
      { id: 'a', midi: 60, startTick: 0, durationTicks: ppq, role: 'unknown' },
      { id: 'b', midi: 60, startTick: ppq, durationTicks: ppq / 2, role: 'unknown' },
      { id: 'c', midi: 60, startTick: ppq + ppq / 2, durationTicks: ppq / 2, role: 'unknown' },
      // half-bar longer arrival — coverage should promote when base leaves Passing
      { id: 'd', midi: 60, startTick: 2 * ppq, durationTicks: ppq, role: 'unknown' },
      { id: 'e', midi: 60, startTick: 3 * ppq, durationTicks: ppq / 2, role: 'unknown' },
      { id: 'f', midi: 60, startTick: 3 * ppq + ppq / 2, durationTicks: ppq / 2, role: 'unknown' },
      { id: 'g', midi: 60, startTick: 4 * ppq, durationTicks: ppq, role: 'unknown' },
    ]
    const base = assignMelodyRoles(
      melody,
      { ppq, tonality: 0, promoteChangePoints: true },
      { force: true },
    )
    const covered = assignMelodyRoles(
      melody,
      {
        ppq,
        tonality: 0,
        promoteChangePoints: true,
        promoteCoverage: true,
        maxCoveragePromotesPerBar: 2,
      },
      { force: true },
    )
    const baseN = base.filter((n) => n.role === 'pmn').length
    const covN = covered.filter((n) => n.role === 'pmn').length
    expect(covN).toBeGreaterThanOrEqual(baseN)
    expect(covered.find((n) => n.id === 'd')?.role).toBe('pmn')
    expect(covN).toBeLessThan(melody.length)
  })
})
