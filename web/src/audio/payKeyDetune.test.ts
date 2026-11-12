import { describe, expect, it } from 'vitest'
import { composePayKeyCents, resolveFineDetuneCents } from './payKeyDetune'

describe('composePayKeyCents', () => {
  it('combines shift and fine', () => {
    expect(composePayKeyCents({ shiftSemitones: 2, fineCents: -12 })).toBe(188)
    expect(composePayKeyCents({})).toBe(0)
  })
})

describe('resolveFineDetuneCents', () => {
  it('prefers session/query detune when set', () => {
    expect(
      resolveFineDetuneCents({
        queryDetuneCents: -32,
        globalCents: 10,
        entryCents: 5,
      }),
    ).toBe(-32)
  })

  it('sums global + entry when no query', () => {
    expect(
      resolveFineDetuneCents({
        queryDetuneCents: null,
        globalCents: 10,
        entryCents: 5,
      }),
    ).toBe(15)
  })
})
