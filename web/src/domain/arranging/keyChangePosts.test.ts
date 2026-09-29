import { describe, expect, it } from 'vitest'
import {
  chordContainsPc,
  suggestPostKeyChanges,
  seventhRootsContaining,
} from './keyChangePosts'

describe('suggestPostKeyChanges', () => {
  it('C→F with hold C yields paths where every step contains C', () => {
    const paths = suggestPostKeyChanges({
      fromTonality: 0,
      toTonality: 5,
      holdPc: 0,
      preferUp: true,
    })
    expect(paths.length).toBeGreaterThan(0)
    for (const p of paths) {
      expect(p.templateId?.startsWith('post-')).toBe(true)
      for (const s of p.steps) {
        expect(chordContainsPc(s.rootPc, s.natureId, 0)).toBe(true)
      }
      expect(p.steps.at(-1)!.rootPc).toBe(5)
    }
  })

  it('C→Db with hold Ab (in V7 and new I) yields posts', () => {
    const paths = suggestPostKeyChanges({
      fromTonality: 0,
      toTonality: 1,
      holdPc: 8, // Ab ∈ Ab7 and Db
      preferUp: true,
    })
    expect(paths.length).toBeGreaterThan(0)
    for (const p of paths) {
      for (const s of p.steps) {
        expect(chordContainsPc(s.rootPc, s.natureId, 8)).toBe(true)
      }
    }
  })

  it('rejects hold that cannot land in new tonic', () => {
    const paths = suggestPostKeyChanges({
      fromTonality: 0,
      toTonality: 1,
      holdPc: 0, // C ∉ Db major triad
    })
    expect(paths).toEqual([])
  })

  it('seventhRootsContaining covers 1/3/5/b7 roles', () => {
    const roots = seventhRootsContaining(0)
    expect(roots).toContain(0)
    expect(roots).toContain(8)
    expect(roots).toContain(5)
    expect(roots).toContain(2)
  })
})
