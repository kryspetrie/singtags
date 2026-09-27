/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { focusTabForGuidedStep, modeForGuidedStep } from '../../application/arranging/GuidedSteps'

describe('guidedStep chrome mapping', () => {
  it('maps each guided step to the matching focus tab', () => {
    expect(focusTabForGuidedStep('home')).toBe('home')
    expect(focusTabForGuidedStep('chords')).toBe('choose')
    expect(focusTabForGuidedStep('check')).toBe('check')
    expect(focusTabForGuidedStep('polish')).toBe('polish')
  })

  it('maps check/polish to review mode', () => {
    expect(modeForGuidedStep('home')).toBe('arrange')
    expect(modeForGuidedStep('check')).toBe('review')
    expect(modeForGuidedStep('polish')).toBe('review')
  })
})
