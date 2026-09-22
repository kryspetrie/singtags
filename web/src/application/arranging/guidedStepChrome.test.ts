/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { focusTabForGuidedStep, modeForGuidedStep } from '../../application/arranging/GuidedSteps'

describe('guidedStep chrome mapping', () => {
  it('maps each guided step to the matching focus tab', () => {
    expect(focusTabForGuidedStep('pillars')).toBe('now')
    expect(focusTabForGuidedStep('roles')).toBe('now')
    expect(focusTabForGuidedStep('chords')).toBe('choose')
    expect(focusTabForGuidedStep('check')).toBe('check')
    expect(focusTabForGuidedStep('polish')).toBe('polish')
  })

  it('maps check/polish to review mode', () => {
    expect(modeForGuidedStep('pillars')).toBe('arrange')
    expect(modeForGuidedStep('check')).toBe('review')
    expect(modeForGuidedStep('polish')).toBe('review')
  })
})
