/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  inversionKindFromVoicing,
  inversionLabelFromVoicing,
  voicingDisplayLabel,
  voicingRoleStack,
  voicingRoleStackTitle,
} from './inversionLabel'

describe('inversionLabel', () => {
  it('maps bass role to inversion', () => {
    expect(inversionKindFromVoicing('1351')).toBe('root')
    expect(inversionKindFromVoicing('3515')).toBe('1st')
    expect(inversionKindFromVoicing('5135')).toBe('2nd')
    expect(inversionKindFromVoicing('7135')).toBe('3rd')
    expect(inversionLabelFromVoicing('5317')).toBe('2nd inv')
    expect(voicingDisplayLabel('1351')).toBe('root · 1351')
  })

  it('parses MuseScore-style TTBB role stacks', () => {
    expect(voicingRoleStack('5317')).toEqual({
      bass: '5',
      bari: '3',
      lead: '1',
      tenor: '7',
    })
    expect(voicingRoleStackTitle('5317')).toContain('Tenor: seventh')
    expect(voicingRoleStackTitle('5317')).toContain('Lead: root')
    expect(voicingRoleStackTitle('5317')).toContain('2nd inv')
  })
})
