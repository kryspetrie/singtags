/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  inversionKindFromVoicing,
  inversionLabelFromVoicing,
  voicingDisplayLabel,
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
})
