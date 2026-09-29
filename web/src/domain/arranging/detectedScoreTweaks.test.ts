/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DETECTED_SCORE_TWEAKS,
  detectedScoreTweaksEqual,
  formatDetectedScoreTweaksJson,
  normalizeDetectedScoreTweaks,
  parseDetectedScoreTweaksJson,
} from './detectedScoreTweaks'
import { inferImpliedChordsFromMelody, reorderImpliedByMelodyRole } from './impliedMelodyChord'

describe('detectedScoreTweaks', () => {
  it('normalize fills defaults for partial JSON', () => {
    const t = normalizeDetectedScoreTweaks({
      version: 2,
      mild: { ii7CircleBoost: 99 },
      bold: { secondaryBaseBoost: 1 },
    })
    expect(t.version).toBe(2)
    expect(t.mild.ii7CircleBoost).toBe(99)
    expect(t.mild.ii7BaseBoost).toBe(DEFAULT_DETECTED_SCORE_TWEAKS.mild.ii7BaseBoost)
    expect(t.bold.secondaryBaseBoost).toBe(1)
    expect(t.bold.exoticPenalty).toBe(DEFAULT_DETECTED_SCORE_TWEAKS.bold.exoticPenalty)
  })

  it('parse round-trips defaults', () => {
    const text = formatDetectedScoreTweaksJson(DEFAULT_DETECTED_SCORE_TWEAKS)
    const parsed = parseDetectedScoreTweaksJson(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(detectedScoreTweaksEqual(parsed.tweaks, DEFAULT_DETECTED_SCORE_TWEAKS)).toBe(true)
  })

  it('rejects non-object JSON', () => {
    expect(parseDetectedScoreTweaksJson('[1,2]').ok).toBe(false)
    expect(parseDetectedScoreTweaksJson('not json').ok).toBe(false)
  })

  it('migrates v1 Bold weights to v2 shipped defaults', () => {
    const t = normalizeDetectedScoreTweaks({
      version: 1,
      bold: { secondaryBaseBoost: 55, secondaryCircleBoost: 20 },
      mild: { boldIi7Demote: 15 },
    })
    expect(t.version).toBe(2)
    expect(t.bold.secondaryBaseBoost).toBe(DEFAULT_DETECTED_SCORE_TWEAKS.bold.secondaryBaseBoost)
    expect(t.mild.boldIi7Demote).toBe(0)
  })

  it('v2 custom Bold weights are preserved', () => {
    const t = normalizeDetectedScoreTweaks({
      version: 2,
      bold: { secondaryBaseBoost: 1 },
    })
    expect(t.bold.secondaryBaseBoost).toBe(1)
    expect(t.bold.exoticPenalty).toBe(DEFAULT_DETECTED_SCORE_TWEAKS.bold.exoticPenalty)
  })

  it('defaults keep Mild and Bold ★ matched on C→F (ii7)', () => {
    const BB = 10
    const mild = reorderImpliedByMelodyRole(
      inferImpliedChordsFromMelody({
        melodyMidi: 60,
        tonality: BB,
        nextMelodyMidi: 65,
        interest: 'mild',
        limit: 4,
      }),
      'pmn',
      'mild',
    )
    const bold = reorderImpliedByMelodyRole(
      inferImpliedChordsFromMelody({
        melodyMidi: 60,
        tonality: BB,
        nextMelodyMidi: 65,
        interest: 'bold',
        limit: 4,
      }),
      'pmn',
      'bold',
    )
    expect(mild[0]!.natureId).toBe('m7')
    expect(bold[0]!.natureId).toBe('m7')
  })
})
