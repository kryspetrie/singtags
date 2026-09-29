import { describe, expect, it } from 'vitest'
import { coachIdeasHelpForStep } from './coachIdeasHelp'
import { GUIDED_STEPS } from './GuidedSteps'

describe('coachIdeasHelp', () => {
  it('covers every guided step with theory lessons and help', () => {
    for (const step of GUIDED_STEPS) {
      const pack = coachIdeasHelpForStep(step.id)
      expect(pack.ideasIntro.length).toBeGreaterThan(20)
      expect(pack.ideas.length).toBeGreaterThanOrEqual(2)
      expect(pack.helpIntro.length).toBeGreaterThan(10)
      expect(pack.help.length).toBeGreaterThanOrEqual(2)
      for (const idea of pack.ideas) {
        expect(idea.body.length).toBeGreaterThan(40)
        expect(idea.glossaryIds?.length ?? 0).toBeGreaterThan(0)
      }
    }
  })
})
