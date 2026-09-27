/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'
import {
  MELODY_PART_BORDER_COLOR,
  melodyRoleBorderColor,
  paintMelodyRoleBorders,
} from './melodyRoleLabels'

describe('melodyRoleLabels borders', () => {
  it('maps Strong→yellow and Passing→green', () => {
    expect(melodyRoleBorderColor('pmn')).toMatch(/230,\s*175,\s*20/)
    expect(melodyRoleBorderColor('smn')).toMatch(/28,\s*130,\s*78/)
  })

  it('always paints left-edge stripes (melody then role)', () => {
    const fillRect = vi.fn()
    const styles: string[] = []
    const ctx = {
      get fillStyle() {
        return ''
      },
      set fillStyle(v: string) {
        styles.push(v)
      },
      fillRect,
    }
    paintMelodyRoleBorders(ctx, {
      x: 20,
      y: 20,
      w: 40,
      h: 16,
      role: 'pmn',
      showMelody: true,
    })
    expect(styles[0]).toBe(MELODY_PART_BORDER_COLOR)
    expect(styles).toContain(melodyRoleBorderColor('pmn'))
    expect(fillRect.mock.calls[0]).toEqual([21, 21, expect.any(Number), 14])
    // Role stripe sits to the right of the melody stripe
    const roleCall = fillRect.mock.calls[1]!
    expect(roleCall[0]).toBeGreaterThan(21)
  })

  it('melody-only paints a single red left stripe', () => {
    const fillRect = vi.fn()
    const styles: string[] = []
    const ctx = {
      get fillStyle() {
        return ''
      },
      set fillStyle(v: string) {
        styles.push(v)
      },
      fillRect,
    }
    paintMelodyRoleBorders(ctx, {
      x: 10,
      y: 10,
      w: 30,
      h: 14,
      role: null,
      showMelody: true,
    })
    expect(styles).toEqual([MELODY_PART_BORDER_COLOR])
    expect(fillRect).toHaveBeenCalledTimes(1)
  })
})
