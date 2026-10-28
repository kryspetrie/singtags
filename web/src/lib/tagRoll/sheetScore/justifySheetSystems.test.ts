import { describe, expect, it } from 'vitest'
import { justifySheetSystems } from './justifySheetSystems'

describe('justifySheetSystems', () => {
  it('stretches each system to the target inner width', () => {
    const places = [
      { systemIndex: 0, x: 40, width: 100 },
      { systemIndex: 0, x: 140, width: 80 },
      { systemIndex: 1, x: 40, width: 60 },
      { systemIndex: 1, x: 100, width: 60 },
      { systemIndex: 1, x: 160, width: 40 },
    ]
    justifySheetSystems(places, { enabled: true, leftPad: 40, targetInnerWidth: 400 })
    const row0 = places.filter((p) => p.systemIndex === 0)
    const row1 = places.filter((p) => p.systemIndex === 1)
    expect(row0.reduce((s, p) => s + p.width, 0)).toBe(400)
    expect(row1.reduce((s, p) => s + p.width, 0)).toBe(400)
    expect(row0[0]!.x).toBe(40)
    expect(row0[0]!.x + row0[0]!.width).toBe(row0[1]!.x)
    expect(row0[1]!.x + row0[1]!.width).toBe(440)
    expect(row1[2]!.x + row1[2]!.width).toBe(440)
  })

  it('keeps relative bar proportions when stretching', () => {
    const places = [
      { systemIndex: 0, x: 0, width: 100 },
      { systemIndex: 0, x: 100, width: 50 },
    ]
    justifySheetSystems(places, { enabled: true, leftPad: 0, targetInnerWidth: 300 })
    expect(places[0]!.width).toBe(200)
    expect(places[1]!.width).toBe(100)
  })

  it('does not shrink an already-full or overflowing system', () => {
    const places = [
      { systemIndex: 0, x: 10, width: 200 },
      { systemIndex: 0, x: 210, width: 200 },
    ]
    justifySheetSystems(places, { enabled: true, leftPad: 10, targetInnerWidth: 300 })
    expect(places[0]!.width).toBe(200)
    expect(places[1]!.width).toBe(200)
    expect(places[0]!.x).toBe(10)
    expect(places[1]!.x).toBe(210)
  })

  it('no-ops when disabled', () => {
    const places = [{ systemIndex: 0, x: 0, width: 50 }]
    justifySheetSystems(places, { enabled: false, leftPad: 0, targetInnerWidth: 200 })
    expect(places[0]!.width).toBe(50)
  })
})
