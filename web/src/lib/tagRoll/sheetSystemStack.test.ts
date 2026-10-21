/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { stackSheetSystems } from './sheetSystemStack'

describe('stackSheetSystems', () => {
  it('widens gaps for chord clearance between systems', () => {
    const places = [
      { systemIndex: 0, pageIndex: 0, y: 0 },
      { systemIndex: 0, pageIndex: 0, y: 0 },
      { systemIndex: 1, pageIndex: 0, y: 0 },
    ]
    stackSheetSystems(places, {
      systemBodyHeight: 100,
      baseSystemGap: 20,
      chordClearanceBySystem: [10, 50],
      existingTopHeadroom: 8,
      pageMode: false,
      pageSystemBudget: () => 1000,
      pageContentTopY: () => 0,
      continuousOriginY: 30,
    })
    expect(places[0]!.y).toBe(30 + Math.max(0, 10 - 8))
    expect(places[2]!.y).toBe(places[0]!.y + 100 + 50)
  })

  it('spills to a new page when clearance exceeds the budget', () => {
    const places = [
      { systemIndex: 0, pageIndex: 0, y: 0 },
      { systemIndex: 1, pageIndex: 0, y: 0 },
      { systemIndex: 2, pageIndex: 0, y: 0 },
    ]
    stackSheetSystems(places, {
      systemBodyHeight: 100,
      baseSystemGap: 20,
      // sys1 needs only base gap; sys2 needs 80 → 100+20+100+80+100 = 400 > 250
      chordClearanceBySystem: [0, 10, 80],
      existingTopHeadroom: 8,
      pageMode: true,
      pageSystemBudget: () => 250,
      pageContentTopY: (pi) => pi * 400,
      continuousOriginY: 0,
    })
    expect(places[0]!.pageIndex).toBe(0)
    expect(places[1]!.pageIndex).toBe(0)
    expect(places[2]!.pageIndex).toBe(1)
    expect(places[2]!.y).toBe(400 + Math.max(0, 80 - 8))
  })
})
