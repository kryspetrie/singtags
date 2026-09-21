import { describe, expect, it } from 'vitest'
import {
  combineKeyChangePaths,
  findPivotChords,
  keyLabel,
  signedKeyInterval,
  suggestKeyChanges,
  suggestKeyChangesGrouped,
  type ModulationCharacter,
  type ModulationPath,
} from './keyChange'
import { pcOf, secondaryDominantRootOf } from './secondaryDominant'
import { counterpartRoot } from './counterpart'
import {
  combineModulationPaths,
  suggestModulation,
} from '../../application/arranging/KeyChange'

/** Pitch-class aliases for readable examples. */
const PC = {
  C: 0,
  Db: 1,
  D: 2,
  Eb: 3,
  E: 4,
  F: 5,
  Gb: 6,
  G: 7,
  Ab: 8,
  A: 9,
  Bb: 10,
  B: 11,
} as const

function assertValidPath(p: ModulationPath) {
  expect(p.steps.length).toBe(p.length)
  expect(p.length).toBeGreaterThanOrEqual(1)
  for (const s of p.steps) {
    expect(s.rootPc).toBeGreaterThanOrEqual(0)
    expect(s.rootPc).toBeLessThan(12)
    expect(s.natureId.length).toBeGreaterThan(0)
    expect(s.role.length).toBeGreaterThan(0)
  }
  expect(p.label.length).toBeGreaterThan(0)
  expect(p.reason.length).toBeGreaterThan(0)
  expect(['abrupt', 'direct', 'smooth', 'extended', 'hybrid']).toContain(p.character)
  if (p.character === 'hybrid') {
    expect(p.styleShift).toBeTruthy()
    expect(p.styleShift!.atStep).toBeGreaterThanOrEqual(1)
    expect(p.styleShift!.atStep).toBeLessThan(p.steps.length)
    expect(p.styleShift!.from).not.toBe('hybrid')
    expect(p.styleShift!.to).not.toBe('hybrid')
  }
}

function rootsOf(p: ModulationPath): number[] {
  return p.steps.map((s) => s.rootPc)
}

function naturesOf(p: ModulationPath): string[] {
  return p.steps.map((s) => s.natureId)
}

function findByKind(paths: ModulationPath[], kind: string): ModulationPath {
  const hit = paths.find((p) => p.id.includes(kind))
  expect(hit, `missing path kind ${kind}`).toBeTruthy()
  return hit!
}

describe('keyChange helpers', () => {
  it('signedKeyInterval prefers small upward lifts', () => {
    expect(signedKeyInterval(0, 0)).toBe(0)
    expect(signedKeyInterval(0, 1)).toBe(1)
    expect(signedKeyInterval(0, 11, true)).toBe(-1)
    expect(signedKeyInterval(0, 11, false)).toBe(-1)
    expect(signedKeyInterval(0, 7)).toBe(-5)
    expect(Math.abs(signedKeyInterval(0, 6))).toBe(6)
  })

  it('keyLabel formats major/minor', () => {
    expect(keyLabel(0, 'major')).toBe('C')
    expect(keyLabel(9, 'minor')).toBe('Am')
  })

  it('findPivotChords finds shared roots C↔G', () => {
    const pivots = findPivotChords(PC.C, PC.G, 'major', 'major')
    const roots = new Set(pivots.map((p) => p.rootPc))
    expect(roots.has(PC.C)).toBe(true) // I / IV
    expect(roots.has(PC.G)).toBe(true) // V / I
    expect(roots.has(PC.A)).toBe(true) // vi / ii
    expect(pivots.every((p) => p.fromRoman && p.toRoman)).toBe(true)
  })
})

describe('well-defined examples: C major → G major', () => {
  const from = PC.C
  const to = PC.G
  const vG = secondaryDominantRootOf(to) // D
  const vvG = secondaryDominantRootOf(vG) // A
  const subG = counterpartRoot(vG) // A♭

  it('documents expected dominant roots', () => {
    expect(vG).toBe(PC.D)
    expect(vvG).toBe(PC.A)
    expect(subG).toBe(PC.Ab)
  })

  it('abrupt: hard cut lands on G major', () => {
    const paths = suggestKeyChanges({
      fromTonality: from,
      toTonality: to,
      characters: ['abrupt'],
      limit: 16,
    })
    const cut = findByKind(paths, 'direct-I')
    expect(rootsOf(cut)).toEqual([PC.G])
    expect(naturesOf(cut)).toEqual(['major'])
    expect(cut.intervalSemis).toBe(-5)
  })

  it('direct: V7→I is exactly D7 → G', () => {
    const paths = suggestKeyChanges({
      fromTonality: from,
      toTonality: to,
      characters: ['direct'],
      limit: 16,
    })
    const cadence = findByKind(paths, 'V7-I')
    expect(rootsOf(cadence)).toEqual([PC.D, PC.G])
    expect(naturesOf(cadence)).toEqual(['seventh', 'major'])
    expect(cadence.steps[0]!.romanTo).toBe('V7')
    expect(cadence.steps[1]!.romanTo).toBe('I')
  })

  it('direct: V7/V → V7 → I is A7 → D7 → G', () => {
    const paths = suggestKeyChanges({
      fromTonality: from,
      toTonality: to,
      characters: ['direct'],
      limit: 16,
    })
    const highway = findByKind(paths, 'VV-V-I')
    expect(rootsOf(highway)).toEqual([PC.A, PC.D, PC.G])
    expect(naturesOf(highway)).toEqual(['seventh', 'seventh', 'major'])
  })

  it('direct: ♭II7 → I is A♭7 → G', () => {
    const paths = suggestKeyChanges({
      fromTonality: from,
      toTonality: to,
      characters: ['direct'],
      limit: 16,
    })
    const sub = findByKind(paths, 'subV-I')
    expect(rootsOf(sub)).toEqual([PC.Ab, PC.G])
    expect(naturesOf(sub)).toEqual(['seventh', 'major'])
    expect(sub.steps[0]!.romanTo).toBe('♭II7')
  })

  it('smooth: Em pivot (iii=vi) prepares D7 → G', () => {
    const paths = suggestKeyChanges({
      fromTonality: from,
      toTonality: to,
      characters: ['smooth'],
      limit: 32,
    })
    const pivot = findByKind(paths, `pivot-${PC.E}`)
    const mid = pivot.steps.find((s) => /pivot/i.test(s.role))!
    expect(mid.rootPc).toBe(PC.E)
    expect(mid.romanFrom).toBe('iii')
    expect(mid.romanTo).toBe('vi')
    expect(rootsOf(pivot).slice(-2)).toEqual([PC.D, PC.G])
  })

  it('extended: IV plateau visits C (IV of G) then D7 → G', () => {
    const paths = suggestKeyChanges({
      fromTonality: from,
      toTonality: to,
      characters: ['extended'],
      limit: 16,
    })
    const plateau = findByKind(paths, 'IV-V-I')
    // Depart I/C, plateau IV/C, V7/D, I/G — consecutive C majors may remain as two steps
    expect(plateau.steps[plateau.steps.length - 2]!.rootPc).toBe(PC.D)
    expect(plateau.steps[plateau.steps.length - 2]!.natureId).toBe('seventh')
    expect(plateau.steps[plateau.steps.length - 1]!.rootPc).toBe(PC.G)
    expect(plateau.steps.some((s) => s.romanTo === 'IV')).toBe(true)
  })
})

describe('well-defined examples: C major → D♭ major (half-step lift)', () => {
  const from = PC.C
  const to = PC.Db
  const vDb = secondaryDominantRootOf(to) // A♭

  it('documents V7 of D♭ as A♭', () => {
    expect(vDb).toBe(PC.Ab)
    expect(signedKeyInterval(from, to)).toBe(1)
  })

  it('smooth chromatic lift is C7 → A♭7 → D♭', () => {
    const paths = suggestKeyChanges({
      fromTonality: from,
      toTonality: to,
      characters: ['smooth'],
      limit: 16,
    })
    const lift = findByKind(paths, 'lift-up')
    expect(rootsOf(lift)).toEqual([PC.C, PC.Ab, PC.Db])
    expect(naturesOf(lift)).toEqual(['seventh', 'seventh', 'major'])
    expect(lift.label).toMatch(/lift up/i)
  })

  it('direct V7→I is A♭7 → D♭', () => {
    const paths = suggestKeyChanges({
      fromTonality: from,
      toTonality: to,
      characters: ['direct'],
      limit: 8,
    })
    const cadence = findByKind(paths, 'V7-I')
    expect(rootsOf(cadence)).toEqual([PC.Ab, PC.Db])
  })
})

describe('well-defined examples: F major → B♭ major', () => {
  it('V7 of B♭ is F — home tonic is already the new dominant (I7-as-V)', () => {
    expect(secondaryDominantRootOf(PC.Bb)).toBe(PC.F)
    const paths = suggestKeyChanges({
      fromTonality: PC.F,
      toTonality: PC.Bb,
      characters: ['direct'],
      limit: 16,
    })
    const cadence = findByKind(paths, 'I7-as-V')
    expect(rootsOf(cadence)).toEqual([PC.F, PC.Bb])
    expect(cadence.templateId).toBe('I7-as-V')
    const setup = findByKind(paths, 'I-V7')
    // Old I and V7/new share root F — sequence is F major then F seventh
    expect(setup.steps[0]!.rootPc).toBe(PC.F)
    expect(setup.steps[1]!.rootPc).toBe(PC.F)
    expect(setup.steps[0]!.natureId).toBe('major')
    expect(setup.steps[1]!.natureId).toBe('seventh')
  })
})

describe('well-defined examples: A minor → C major', () => {
  it('arrives on major tonic and offers V7→I as G7 → C', () => {
    const paths = suggestKeyChanges({
      fromTonality: PC.A,
      toTonality: PC.C,
      fromMode: 'minor',
      toMode: 'major',
      characters: ['direct'],
      limit: 16,
    })
    const cadence = findByKind(paths, 'V7-I')
    expect(rootsOf(cadence)).toEqual([PC.G, PC.C])
    expect(naturesOf(cadence)).toEqual(['seventh', 'major'])
  })
})

describe('suggestKeyChanges (general)', () => {
  it('same key returns stay path', () => {
    const paths = suggestKeyChanges({ fromTonality: 5, toTonality: 5 })
    expect(paths).toHaveLength(1)
    expect(paths[0]!.intervalSemis).toBe(0)
    expect(paths[0]!.steps[0]!.rootPc).toBe(5)
  })

  it('always includes V7→I direct cadence into new key', () => {
    for (let from = 0; from < 12; from++) {
      for (let to = 0; to < 12; to++) {
        if (from === to) continue
        const paths = suggestKeyChanges({ fromTonality: from, toTonality: to, limit: 40 })
        expect(paths.length).toBeGreaterThan(0)
        paths.forEach(assertValidPath)
        const v = secondaryDominantRootOf(to)
        const hit = paths.find(
          (p) =>
            p.character === 'direct' &&
            p.steps.length === 2 &&
            p.steps[0]!.rootPc === v &&
            p.steps[0]!.natureId === 'seventh' &&
            p.steps[1]!.rootPc === to,
        )
        expect(hit, `missing V7-I for ${from}->${to}`).toBeTruthy()
      }
    }
  })

  it('covers all characters including hybrid for C→D♭', () => {
    const grouped = suggestKeyChangesGrouped({
      fromTonality: 0,
      toTonality: 1,
      limit: 64,
    })
    for (const c of [
      'abrupt',
      'direct',
      'smooth',
      'hybrid',
      'extended',
    ] as ModulationCharacter[]) {
      expect(grouped[c].length, c).toBeGreaterThan(0)
      grouped[c].forEach(assertValidPath)
    }
  })

  it('filters by character and length', () => {
    const short = suggestKeyChanges({
      fromTonality: 0,
      toTonality: 7,
      characters: ['abrupt', 'direct'],
      maxLength: 2,
      limit: 20,
    })
    expect(short.every((p) => p.length <= 2)).toBe(true)
    expect(short.every((p) => p.character === 'abrupt' || p.character === 'direct')).toBe(true)

    const longOnly = suggestKeyChanges({
      fromTonality: 0,
      toTonality: 7,
      characters: ['extended'],
      minLength: 4,
      limit: 20,
    })
    expect(longOnly.length).toBeGreaterThan(0)
    expect(longOnly.every((p) => p.character === 'extended' && p.length >= 4)).toBe(true)
  })

  it('includeHybrids:false omits hybrid character', () => {
    const paths = suggestKeyChanges({
      fromTonality: 0,
      toTonality: 7,
      includeHybrids: false,
      limit: 64,
    })
    expect(paths.every((p) => p.character !== 'hybrid')).toBe(true)
  })

  it('half-step lift includes chromatic-lift smooth path', () => {
    const paths = suggestKeyChanges({ fromTonality: 0, toTonality: 1, characters: ['smooth'] })
    expect(paths.some((p) => /lift/i.test(p.label) || /lift/i.test(p.id))).toBe(true)
  })

  it('whole-step lift includes chromatic-lift path', () => {
    const paths = suggestKeyChanges({ fromTonality: 0, toTonality: 2 })
    expect(paths.some((p) => p.id.includes('lift'))).toBe(true)
  })

  it('includes V7/V → V7 → I', () => {
    const to = 0
    const paths = suggestKeyChanges({ fromTonality: 5, toTonality: to })
    const v = secondaryDominantRootOf(to)
    const vv = secondaryDominantRootOf(v)
    const hit = paths.find(
      (p) =>
        p.steps.length === 3 &&
        p.steps[0]!.rootPc === vv &&
        p.steps[1]!.rootPc === v &&
        p.steps[2]!.rootPc === to,
    )
    expect(hit).toBeTruthy()
  })

  it('includes tritone-sub approach', () => {
    const to = 0
    const sub = counterpartRoot(secondaryDominantRootOf(to))
    const paths = suggestKeyChanges({ fromTonality: 7, toTonality: to })
    expect(
      paths.some(
        (p) =>
          p.steps.length === 2 &&
          p.steps[0]!.rootPc === sub &&
          p.steps[0]!.natureId === 'seventh' &&
          p.steps[1]!.rootPc === to,
      ),
    ).toBe(true)
  })

  it('pivot paths use shared diatonic chords', () => {
    const paths = suggestKeyChanges({
      fromTonality: 0,
      toTonality: 7,
      characters: ['smooth'],
      limit: 40,
    })
    const pivots = findPivotChords(0, 7)
    const pivotRoots = new Set(pivots.map((p) => p.rootPc))
    const pivotPaths = paths.filter((p) => p.id.includes('pivot-'))
    expect(pivotPaths.length).toBeGreaterThan(0)
    for (const p of pivotPaths) {
      const mid = p.steps.find((s) => /pivot/i.test(s.role))
      expect(mid).toBeTruthy()
      expect(pivotRoots.has(mid!.rootPc)).toBe(true)
    }
  })

  it('extended circle walk ends on new tonic via its V7', () => {
    const to = 4
    const v = secondaryDominantRootOf(to)
    const paths = suggestKeyChanges({
      fromTonality: 0,
      toTonality: to,
      characters: ['extended'],
    })
    const walk = paths.find((p) => p.id.includes('circle-walk'))
    expect(walk).toBeTruthy()
    expect(walk!.steps[walk!.steps.length - 1]!.rootPc).toBe(to)
    expect(walk!.steps.some((s) => s.rootPc === v && s.natureId === 'seventh')).toBe(true)
  })

  it('minor→major and major→minor produce paths', () => {
    const a = suggestKeyChanges({
      fromTonality: 9,
      toTonality: 0,
      fromMode: 'minor',
      toMode: 'major',
    })
    const b = suggestKeyChanges({
      fromTonality: 0,
      toTonality: 9,
      fromMode: 'major',
      toMode: 'minor',
    })
    expect(a.length).toBeGreaterThan(3)
    expect(b.length).toBeGreaterThan(3)
    expect(b.some((p) => p.steps[p.steps.length - 1]!.natureId === 'minor')).toBe(true)
    a.forEach(assertValidPath)
    b.forEach(assertValidPath)
  })

  it('respects limit', () => {
    const paths = suggestKeyChanges({ fromTonality: 0, toTonality: 5, limit: 3 })
    expect(paths.length).toBeLessThanOrEqual(3)
  })

  it('dedupes identical step sequences', () => {
    const paths = suggestKeyChanges({ fromTonality: 0, toTonality: 7, limit: 64 })
    const keys = paths.map((p) => p.steps.map((s) => `${s.rootPc}:${s.natureId}`).join('|'))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every path to new key eventually references V7 or tonic of destination', () => {
    for (let from = 0; from < 12; from++) {
      const to = pcOf(from + 3)
      const v = secondaryDominantRootOf(to)
      const paths = suggestKeyChanges({ fromTonality: from, toTonality: to, limit: 40 })
      for (const p of paths) {
        if (p.character === 'abrupt' && p.steps.length === 1 && p.steps[0]!.rootPc === v) {
          continue
        }
        const touches =
          p.steps.some((s) => s.rootPc === to) ||
          p.steps.some((s) => s.rootPc === v && s.natureId === 'seventh')
        expect(touches, p.id).toBe(true)
      }
    }
  })
})

describe('hybrid mid-style combinations', () => {
  it('C→G includes smooth→abrupt pivot cut with styleShift at arrival', () => {
    const paths = suggestKeyChanges({
      fromTonality: PC.C,
      toTonality: PC.G,
      characters: ['hybrid'],
      limit: 32,
    })
    const hit = paths.find((p) => p.id.includes('smooth-abrupt-pivot'))
    expect(hit).toBeTruthy()
    assertValidPath(hit!)
    expect(hit!.styleShift).toEqual({
      from: 'smooth',
      to: 'abrupt',
      atStep: 2,
    })
    expect(hit!.steps[hit!.steps.length - 1]!.rootPc).toBe(PC.G)
    // No V7 immediately before arrival — abrupt cut
    const pre = hit!.steps[hit!.steps.length - 2]!
    expect(!(pre.rootPc === PC.D && pre.natureId === 'seventh')).toBe(true)
  })

  it('C→G smooth→direct hybrid ends D7 → G after a pivot', () => {
    const paths = suggestKeyChanges({
      fromTonality: PC.C,
      toTonality: PC.G,
      characters: ['hybrid'],
      limit: 32,
    })
    const hit = findByKind(paths, 'smooth-direct-pivot')
    expect(hit.styleShift!.from).toBe('smooth')
    expect(hit.styleShift!.to).toBe('direct')
    expect(rootsOf(hit).slice(-2)).toEqual([PC.D, PC.G])
    expect(naturesOf(hit).slice(-2)).toEqual(['seventh', 'major'])
  })

  it('C→D♭ extended→direct scenic is C7 → D♭7-area connector → A♭7 → D♭', () => {
    const paths = suggestKeyChanges({
      fromTonality: PC.C,
      toTonality: PC.Db,
      characters: ['hybrid'],
      limit: 32,
    })
    const hit = findByKind(paths, 'extended-direct-scenic')
    expect(hit.styleShift).toEqual({ from: 'extended', to: 'direct', atStep: 2 })
    expect(rootsOf(hit)).toEqual([PC.C, PC.Db, PC.Ab, PC.Db])
    // chromatic connector is from+1 = Db seventh, then V7 Ab, then Db
    expect(naturesOf(hit)).toEqual(['seventh', 'seventh', 'seventh', 'major'])
  })

  it('direct→smooth IV detour: D7 → C → D7 → G', () => {
    const paths = suggestKeyChanges({
      fromTonality: PC.C,
      toTonality: PC.G,
      characters: ['hybrid'],
      limit: 32,
    })
    const hit = findByKind(paths, 'direct-smooth-iv')
    expect(hit.styleShift).toEqual({ from: 'direct', to: 'smooth', atStep: 1 })
    expect(rootsOf(hit)).toEqual([PC.D, PC.C, PC.D, PC.G])
    expect(naturesOf(hit)).toEqual(['seventh', 'major', 'seventh', 'major'])
  })

  it('smooth→abrupt via ♭II7: G7 → A♭7 → G when leaving C', () => {
    // from C: old V = G; subV of new(G) = Ab; arrival G
    const paths = suggestKeyChanges({
      fromTonality: PC.C,
      toTonality: PC.G,
      characters: ['hybrid'],
      limit: 32,
    })
    const hit = findByKind(paths, 'smooth-abrupt-subV')
    expect(hit.styleShift).toEqual({ from: 'smooth', to: 'abrupt', atStep: 1 })
    expect(rootsOf(hit)).toEqual([PC.G, PC.Ab, PC.G])
    expect(naturesOf(hit)).toEqual(['seventh', 'seventh', 'major'])
  })

  it('extended→abrupt abandon-walk ends on new tonic without requiring final V7', () => {
    const paths = suggestKeyChanges({
      fromTonality: PC.C,
      toTonality: PC.E,
      characters: ['hybrid'],
      limit: 32,
    })
    const hit = findByKind(paths, 'extended-abrupt-abandon')
    expect(hit.styleShift!.from).toBe('extended')
    expect(hit.styleShift!.to).toBe('abrupt')
    expect(hit.steps[hit.steps.length - 1]!.rootPc).toBe(PC.E)
    expect(hit.styleShift!.atStep).toBe(hit.steps.length - 1)
  })
})

describe('combineKeyChangePaths', () => {
  it('splices smooth setup into abrupt finish for C→G', () => {
    const smooth = suggestKeyChanges({
      fromTonality: PC.C,
      toTonality: PC.G,
      characters: ['smooth'],
      limit: 16,
    })
    const abrupt = suggestKeyChanges({
      fromTonality: PC.C,
      toTonality: PC.G,
      characters: ['abrupt'],
      limit: 8,
    })
    const setup = findByKind(smooth, `pivot-${PC.E}`)
    const finish = findByKind(abrupt, 'direct-I')
    const combined = combineKeyChangePaths(setup, finish)
    expect(combined).toBeTruthy()
    assertValidPath(combined!)
    expect(combined!.character).toBe('hybrid')
    expect(combined!.styleShift!.from).toBe('smooth')
    expect(combined!.styleShift!.to).toBe('abrupt')
    expect(combined!.steps[combined!.steps.length - 1]!.rootPc).toBe(PC.G)
    // Setup chords retained before the abrupt G
    expect(combined!.steps.length).toBeGreaterThan(finish.steps.length)
  })

  it('chains multi-hop C→G (direct) then G→A (smooth lift)', () => {
    const leg1 = findByKind(
      suggestKeyChanges({
        fromTonality: PC.C,
        toTonality: PC.G,
        characters: ['direct'],
        limit: 8,
      }),
      'V7-I',
    )
    // G→A is a whole-step lift — smooth lift-up is C♯-area: G7 → E7 → A
    const leg2 = findByKind(
      suggestKeyChanges({
        fromTonality: PC.G,
        toTonality: PC.A,
        characters: ['smooth'],
        limit: 16,
      }),
      'lift-up',
    )
    expect(rootsOf(leg2)).toEqual([PC.G, PC.E, PC.A])

    const hop = combineKeyChangePaths(leg1, leg2)
    expect(hop).toBeTruthy()
    assertValidPath(hop!)
    expect(hop!.fromTonality).toBe(PC.C)
    expect(hop!.toTonality).toBe(PC.A)
    expect(hop!.styleShift!.from).toBe('direct')
    expect(hop!.styleShift!.to).toBe('smooth')
    expect(hop!.label).toMatch(/C → G/)
    expect(hop!.steps[hop!.steps.length - 1]!.rootPc).toBe(PC.A)
    // First leg contributes D7; trailing G dropped then may merge with lift's G7
    expect(hop!.steps[0]!.rootPc).toBe(PC.D)
    expect(hop!.steps[0]!.natureId).toBe('seventh')
  })

  it('returns null when keys are unrelated', () => {
    const a = findByKind(
      suggestKeyChanges({ fromTonality: PC.C, toTonality: PC.G, limit: 8 }),
      'V7-I',
    )
    const b = findByKind(
      suggestKeyChanges({ fromTonality: PC.E, toTonality: PC.F, limit: 8 }),
      'V7-I',
    )
    expect(combineKeyChangePaths(a, b)).toBeNull()
  })
})

describe('application wrappers', () => {
  it('suggestModulation wraps domain suggestions', () => {
    const paths = suggestModulation({ fromTonality: 0, toTonality: 5, limit: 5 })
    expect(paths.length).toBeGreaterThan(0)
    expect(paths.length).toBeLessThanOrEqual(5)
  })

  it('combineModulationPaths matches domain combine', () => {
    const a = findByKind(
      suggestKeyChanges({ fromTonality: PC.C, toTonality: PC.G, characters: ['direct'], limit: 8 }),
      'V7-I',
    )
    const b = findByKind(
      suggestKeyChanges({ fromTonality: PC.C, toTonality: PC.G, characters: ['abrupt'], limit: 8 }),
      'direct-I',
    )
    const viaApp = combineModulationPaths(a, b)
    const viaDomain = combineKeyChangePaths(a, b)
    expect(viaApp?.id).toBe(viaDomain?.id)
    expect(viaApp?.steps).toEqual(viaDomain?.steps)
  })
})
