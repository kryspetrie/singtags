/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  roleDisplayFromToggles,
  roleDisplayLabel,
  roleDisplayShowsMelody,
  roleDisplayShowsRoles,
} from './roleDisplay'

describe('roleDisplay', () => {
  it('maps independent toggles to display mode', () => {
    expect(roleDisplayFromToggles(false, false)).toBe('off')
    expect(roleDisplayFromToggles(true, false)).toBe('melody')
    expect(roleDisplayFromToggles(false, true)).toBe('roles')
    expect(roleDisplayFromToggles(true, true)).toBe('both')
  })

  it('reads melody / roles visibility from mode', () => {
    expect(roleDisplayShowsMelody('off')).toBe(false)
    expect(roleDisplayShowsMelody('melody')).toBe(true)
    expect(roleDisplayShowsRoles('roles')).toBe(true)
    expect(roleDisplayShowsRoles('melody')).toBe(false)
    expect(roleDisplayShowsMelody('both')).toBe(true)
    expect(roleDisplayShowsRoles('both')).toBe(true)
  })

  it('labels modes for HUD chrome', () => {
    expect(roleDisplayLabel('off')).toBe('Off')
    expect(roleDisplayLabel('both')).toBe('Melody + Roles')
  })
})
