import { describe, expect, it } from 'vitest'
import { suggestPillars } from './pillars'
import { isSpringboardRoot } from './approachThree'
import { createEmptyArrangement } from './types'
import { inferPillars } from '../../application/arranging/InferPillars'

describe('remediation: minor-feel mode', () => {
  it('springboards remain degrees 0 and 5 in minor', () => {
    expect(isSpringboardRoot(9, 9, 'minor')).toBe(true) // i in A minor
    expect(isSpringboardRoot(2, 9, 'minor')).toBe(true) // iv
    expect(isSpringboardRoot(4, 9, 'minor')).toBe(false) // V
  })

  it('A-minor-feel melody prefers A / D pillars over C-major bias', () => {
    // Melody outlining A minor: A C E A D F A
    const melody = [
      { id: '1', midi: 69, startTick: 0, durationTicks: 480, role: 'pmn' as const }, // A
      { id: '2', midi: 72, startTick: 480, durationTicks: 480, role: 'pmn' as const }, // C
      { id: '3', midi: 76, startTick: 960, durationTicks: 480, role: 'pmn' as const }, // E
      { id: '4', midi: 69, startTick: 1440, durationTicks: 480, role: 'pmn' as const }, // A
      { id: '5', midi: 74, startTick: 1920, durationTicks: 480, role: 'pmn' as const }, // D
      { id: '6', midi: 77, startTick: 2400, durationTicks: 480, role: 'pmn' as const }, // F
      { id: '7', midi: 69, startTick: 2880, durationTicks: 480, role: 'pmn' as const }, // A
      { id: '8', midi: 72, startTick: 3360, durationTicks: 480, role: 'pmn' as const }, // C
    ]
    const minor = suggestPillars({ melody, tonality: 9, mode: 'minor' })
    const roots = new Set(minor.map((p) => p.rootPc))
    expect(roots.has(9)).toBe(true) // A
    // At least one pillar on A or D (i/iv)
    expect([...roots].some((r) => r === 9 || r === 2)).toBe(true)
  })

  it('inferPillars respects project.tonalityMode', () => {
    const project = createEmptyArrangement('minor')
    project.tonality = 9
    project.tonalityMode = 'minor'
    project.melody = [
      { id: '1', midi: 69, startTick: 0, durationTicks: 960, role: 'pmn' },
      { id: '2', midi: 72, startTick: 960, durationTicks: 960, role: 'pmn' },
      { id: '3', midi: 76, startTick: 1920, durationTicks: 960, role: 'pmn' },
      { id: '4', midi: 69, startTick: 2880, durationTicks: 960, role: 'pmn' },
    ]
    const pillars = inferPillars(project)
    expect(pillars.length).toBeGreaterThan(0)
    expect(pillars.some((p) => p.rootPc === 9)).toBe(true)
  })
})
