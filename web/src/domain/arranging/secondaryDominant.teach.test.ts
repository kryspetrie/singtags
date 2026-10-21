import { describe, expect, it } from 'vitest'
import { glossaryById } from './education'
import { GLOSSARY_DETAILS } from './education/glossaryDetails'
import { dualRomanTeach, romanForChordDetailed } from './secondaryDominant'

const C = 0
const D = 2
const E = 4
const F = 5
const G = 7
const A = 9
const B = 11

describe('dualRomanTeach', () => {
  it('explains V7/V (II7) when the chord drives V', () => {
    const d = romanForChordDetailed({
      rootPc: D,
      natureId: 'seventh',
      tonality: C,
      resolvesToRoot: G,
    })
    expect(dualRomanTeach(d)).toMatch(/V7\/V is primary/)
    expect(dualRomanTeach(d)).toMatch(/II7/)
  })

  it('explains II7 (V7/V) when the drive is unknown', () => {
    const d = romanForChordDetailed({
      rootPc: D,
      natureId: 'seventh',
      tonality: C,
    })
    expect(d.roman).toBe('II7')
    expect(dualRomanTeach(d)).toMatch(/degree name/)
  })

  it('explains I7 (V7/IV) and VI7 (V7/ii)', () => {
    const tonic = romanForChordDetailed({
      rootPc: C,
      natureId: 'seventh',
      tonality: C,
      resolvesToRoot: F,
    })
    expect(dualRomanTeach(tonic)).toMatch(/I7 is the barbershop name/)
    const vi = romanForChordDetailed({
      rootPc: A,
      natureId: 'seventh',
      tonality: C,
    })
    expect(dualRomanTeach(vi)).toMatch(/VI7 is the degree name/)
  })

  it('explains capital III7 and VII7 with no parenthetical', () => {
    const iii = romanForChordDetailed({
      rootPc: E,
      natureId: 'seventh',
      tonality: C,
    })
    expect(iii.roman).toBe('III7')
    expect(iii.altRoman).toBeUndefined()
    expect(dualRomanTeach(iii)).toMatch(/iii7/)
    const vii = romanForChordDetailed({
      rootPc: B,
      natureId: 'seventh',
      tonality: C,
    })
    expect(vii.roman).toBe('VII7')
    expect(dualRomanTeach(vii)).toMatch(/vii7/)
  })

  it('keeps a minor seventh that moves down a fifth as ii7', () => {
    const d = romanForChordDetailed({
      rootPc: D,
      natureId: 'm7',
      tonality: C,
      resolvesToRoot: G,
    })
    expect(d.roman).toBe('ii7')
    expect(d.altRoman).toBeUndefined()
    expect(dualRomanTeach({ ...d, natureId: 'm7' })).toMatch(/minor seventh/)
  })

  it('mentions the Dom9 stamp on a driving V7(9)/V', () => {
    const d = romanForChordDetailed({
      rootPc: D,
      natureId: 'ninth',
      tonality: C,
      resolvesToRoot: G,
    })
    expect(d.roman).toBe('V7(9)/V')
    expect(dualRomanTeach({ ...d, natureId: 'ninth' })).toMatch(/7\(9\)/)
  })

  it('stays quiet for a plain V7', () => {
    const d = romanForChordDetailed({
      rootPc: G,
      natureId: 'seventh',
      tonality: C,
      resolvesToRoot: C,
    })
    expect(dualRomanTeach(d)).toBeNull()
  })

  it('registers the dual_roman glossary', () => {
    expect(glossaryById('dual_roman')?.term).toMatch(/Two names/)
    expect(GLOSSARY_DETAILS.dual_roman?.detail).toMatch(/V7\/V/)
  })
})
