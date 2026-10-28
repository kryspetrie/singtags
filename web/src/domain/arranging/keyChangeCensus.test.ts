import { describe, expect, it } from 'vitest'
import { listModulationOptions } from '../../application/arranging/KeyChangeApply'
import {
  findPivotChords,
  preferredKeyChangeTemplate,
  suggestKeyChanges,
} from './keyChange'
import { pcOf, secondaryDominantRootOf } from './secondaryDominant'
import type { ModulationPath } from './keyChangeShared'

const PPQ = 480

function panel(from: number, to: number) {
  return listModulationOptions({
    fromTonality: from,
    toTonality: to,
    preferUp: true,
    includeHybrids: false,
    includePosts: false,
    limit: 16,
    maxLength: 6,
    startTick: 0,
    endTick: PPQ * 4 * 2,
    ppq: PPQ,
    numerator: 4,
    denominator: 4,
  })
}

function roots(path: ModulationPath): number[] {
  return path.steps.map((s) => s.rootPc)
}

function noAdjacentDuplicate(path: ModulationPath): boolean {
  for (let i = 1; i < path.steps.length; i++) {
    const a = path.steps[i - 1]!
    const b = path.steps[i]!
    if (a.rootPc === b.rootPc && a.natureId === b.natureId) return false
  }
  return true
}

describe('key change census', () => {
  it('names the corpus plant for the preferred intervals', () => {
    expect(preferredKeyChangeTemplate(1)).toBe('lift-up')
    expect(preferredKeyChangeTemplate(2)).toBe('lift-up')
    expect(preferredKeyChangeTemplate(4)).toBe('tertian')
    expect(preferredKeyChangeTemplate(5)).toBe('I7-as-V')
    expect(preferredKeyChangeTemplate(3)).toBeNull()
  })

  it('puts each corpus plant first on the default panel', () => {
    const db = panel(0, 1)
    expect(db[0]!.path.templateId).toBe('lift-up')
    expect(roots(db[0]!.path)).toEqual([0, 8, 1])

    const d = panel(0, 2)
    expect(d[0]!.path.templateId).toBe('lift-up')
    expect(roots(d[0]!.path)).toEqual([0, 9, 2])

    const f = panel(0, 5)
    expect(f[0]!.path.templateId).toBe('I7-as-V')
    expect(roots(f[0]!.path)).toEqual([0, 5])

    const e = panel(0, 4)
    expect(e[0]!.path.templateId).toBe('tertian')
    expect(roots(e[0]!.path)).toEqual([0, 8, secondaryDominantRootOf(4), 4])
    expect(e[0]!.path.steps[1]!.rootPc).not.toBe(4)
  })

  it('shows one row per family and keeps the hitch last', () => {
    for (const to of [1, 2, 3, 4, 5, 7, 10]) {
      const rows = panel(0, to)
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.length).toBeLessThanOrEqual(5)
      expect(rows.every((row) => row.packOk)).toBe(true)
      expect(rows.at(-1)!.path.templateId).toBe('hitch')
      const ids = rows.map((row) => row.path.templateId ?? row.path.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('keeps structural rules across every key pair', () => {
    for (let from = 0; from < 12; from++) {
      for (let to = 0; to < 12; to++) {
        if (from === to) continue
        const paths = suggestKeyChanges({
          fromTonality: from,
          toTonality: to,
          includeHybrids: false,
          limit: 40,
        })
        expect(paths.some((p) => p.id.includes('scenic'))).toBe(false)
        const vNew = secondaryDominantRootOf(to)
        if (from === vNew) {
          expect(paths.some((p) => p.id.includes('circle-walk'))).toBe(false)
        }
        for (const path of paths) {
          expect(noAdjacentDuplicate(path)).toBe(true)
          if (path.templateId === 'tertian') {
            const connector = path.steps[1]
            expect(connector?.rootPc).not.toBe(path.toTonality)
            expect(connector?.natureId).toBe('seventh')
          }
          if (path.templateId === 'hitch') {
            expect(path).not.toBe(paths[0])
          }
        }
        const pivots = findPivotChords(from, to)
        for (const piv of pivots) {
          const back = findPivotChords(to, from).find((p) => p.rootPc === piv.rootPc)
          expect(back?.natureId).toBe(piv.natureId)
        }
      }
    }
  })

  it('does not call a different quality a pivot', () => {
    const pivots = findPivotChords(0, 4)
    expect(pivots.some((p) => p.rootPc === pcOf(9) && p.natureId === 'minor' && p.toRoman === 'IV')).toBe(
      false,
    )
  })
})
