import { describe, expect, it } from 'vitest'
import {
  allGlossary,
  allLessons,
  lessonForLintRule,
  lessonForRuleTag,
  lessonForWizardStep,
  teachAfterFix,
  teachCandidate,
  teachLint,
  teachWizardStep,
} from './explain'
import { tipForStep } from '../coachTips'
import { explanationForLint } from '../../../application/arranging/ExplainCoach'
import type { HarmonizeCandidate } from '../harmonize/types'

describe('education curriculum', () => {
  it('has glossary and lessons populated', () => {
    expect(allGlossary().length).toBeGreaterThanOrEqual(12)
    expect(allLessons().length).toBeGreaterThanOrEqual(20)
  })

  it('teaches wizard steps with citations', () => {
    const m = teachWizardStep('step1_roots')
    expect(m?.headline.toLowerCase()).toContain('root')
    expect(m?.citations.length).toBeGreaterThan(0)
    expect(m?.glossary.some((g) => g.id === 'pillar')).toBe(true)
  })

  it('maps Approach Three tags to lessons', () => {
    expect(lessonForRuleTag('R1_p5')?.id).toBe('L-R1')
    expect(lessonForRuleTag('springboard')?.id).toBe('L-spring')
  })

  it('maps lint rules including aliases', () => {
    expect(lessonForLintRule('illegal-nature')?.id).toBe('L-vocab')
    expect(lessonForLintRule('key-suggestion')?.title).toMatch(/range|Singable/i)
    expect(lessonForLintRule('unconfirmed-pillars')?.wizardStep).toBe('step2_confirm')
  })

  it('teachLint includes live message context', () => {
    const m = teachLint('illegal-nature', 'Chord “half-dim” is outside sai11')
    expect(m.body).toContain('half-dim')
    expect(m.lesson?.id).toBe('L-vocab')
  })

  it('teachCandidate prefers secondary-dom lesson when tagged', () => {
    const c: HarmonizeCandidate = {
      rootPc: 7,
      natureId: 'seventh',
      voicing: '1357',
      spread: false,
      layer: 'passing',
      scfGroup: 1,
      midi: { bass: 43, bari: 59, lead: 62, tenor: 67 },
      score: 10,
      ruleTags: ['R1_p5'],
      label: 'seventh',
      harmonicity: 0.8,
    }
    const m = teachCandidate(c)
    expect(m.headline.toLowerCase()).toMatch(/fifth|circle|secondary/i)
    expect(m.glossary.some((g) => g.id === 'circle_fifths' || g.id === 'secondary_dom')).toBe(true)
  })

  it('tipForStep pulls curriculum', () => {
    const tip = tipForStep('step5_smn_scf')
    expect(tip.lessonId).toBe('L-step5')
    expect(tip.citations?.length).toBeGreaterThan(0)
  })

  it('application ExplainCoach mirrors domain', () => {
    const lint = explanationForLint({
      id: 'x',
      ruleId: 'few-sevenths',
      severity: 'warn',
      message: 'Few BS7s',
    })
    expect(lint.lesson?.id).toBe('L-secdom')
    expect(teachAfterFix('orphan-stack').title.length).toBeGreaterThan(0)
  })

  it('every wizard step used in Guided mode has a lesson', () => {
    for (const step of [
      'melody',
      'step1_roots',
      'step2_confirm',
      'step3_pmn_pcf',
      'step4_smn_pcf',
      'step5_smn_scf',
      'step6_alts',
      'step7_variety',
      'step8_voicing',
      'step9_final',
    ]) {
      expect(lessonForWizardStep(step), step).toBeTruthy()
    }
  })
})
