import type { ArrangementLint, LintRule } from './types'
import { isNatureAllowed } from '../contestProfile'
import { analyzeVoiceLeading } from '../voiceLeading'
import { assessSongEligibility, phraseLengthHint } from '../songEligibility'
import { strongVoicingLints } from '../strongVoicing'
import {
  keySuggestionLints,
  missingPillarCoverageLints,
  motionLints,
  orphanStackLints,
  swipeOpportunityLints,
} from '../motionAndKey'
import {
  copyrightReminderLint,
  doubledThirdLints,
  dullHarmonicityLints,
  homophonyDensityLints,
} from '../denseQa'
import {
  bs7DensityDurationRule,
  bs7DensityRule,
  counterpartFlickerRule,
  dim7ChainRule,
  theorySpacingRule,
  theoryTensionRule,
} from './theoryLintRules'

const TTBB_LEAD_MIN = 50
const TTBB_LEAD_MAX = 77

export const noMelodyRule: LintRule = {
  id: 'no-melody',
  check(project) {
    if (project.melody.length > 0) return []
    return [
      {
        id: 'no-melody',
        ruleId: 'no-melody',
        severity: 'error',
        message: 'Add a lead melody before harmonizing.',
      },
    ]
  },
}

export const pillarsRule: LintRule = {
  id: 'pillars',
  check(project) {
    if (project.melody.length === 0) return []
    if (project.pillars.length === 0) {
      return [
        {
          id: 'no-pillars',
          ruleId: 'no-pillars',
          severity: 'error',
          message: 'Infer and confirm primary pillars (Step I–II).',
        },
      ]
    }
    if (project.pillars.some((p) => !p.confirmed)) {
      return [
        {
          id: 'unconfirmed-pillars',
          ruleId: 'unconfirmed-pillars',
          severity: 'warn',
          message: 'Some pillars are unconfirmed — review before treating the chart as finished.',
        },
      ]
    }
    return []
  },
}

export const leadRangeRule: LintRule = {
  id: 'lead-range',
  check(project, ctx) {
    if (ctx.checkLeadRange === false) return []
    const out: ArrangementLint[] = []
    for (const n of project.melody) {
      if (n.midi < TTBB_LEAD_MIN || n.midi > TTBB_LEAD_MAX) {
        out.push({
          id: `range-${n.id}`,
          ruleId: 'lead-range',
          severity: 'warn',
          message: `Lead note MIDI ${n.midi} may be outside average TTBB lead range — check key.`,
          noteId: n.id,
        })
      }
    }
    return out
  },
}

export const illegalNatureRule: LintRule = {
  id: 'illegal-nature',
  check(project, ctx) {
    const out: ArrangementLint[] = []
    for (const s of project.stacks) {
      // Unidentified stacks are not "outside vocabulary" — they need ID first.
      if (!s.natureId || s.natureId === 'unknown') continue
      if (!isNatureAllowed(ctx.profile, s.natureId)) {
        out.push({
          id: `illegal-${s.id}`,
          ruleId: 'illegal-nature',
          severity: ctx.profile === 'learning' ? 'warn' : 'error',
          message: `Chord “${s.natureId}” is outside the ${ctx.profile} vocabulary.`,
          stackId: s.id,
          data: { natureId: s.natureId },
        })
      }
    }
    return out
  },
}

export const unrecognizedNatureRule: LintRule = {
  id: 'unrecognized-nature',
  check(project) {
    const out: ArrangementLint[] = []
    for (const s of project.stacks) {
      if (!s.midi) continue
      if (s.natureId && s.natureId !== 'unknown') continue
      out.push({
        id: `unrecognized-${s.id}`,
        ruleId: 'unrecognized-nature',
        severity: 'warn',
        message: 'Chord not recognized in the library — revoice or pick a catalogue chord.',
        stackId: s.id,
        teachingId: 'L-vocab',
      })
    }
    return out
  },
}

export const augUsageRule: LintRule = {
  id: 'aug-usage',
  check(project) {
    const out: ArrangementLint[] = []
    let augCount = 0
    for (const s of project.stacks) {
      if (s.natureId !== 'aug') continue
      augCount++
      if (s.layer === 'primary') {
        out.push({
          id: `aug-pillar-${s.id}`,
          ruleId: 'aug-pillar',
          severity: 'warn',
          message: 'Augmented chords are last-resort / melody-forced — avoid as primary pillars.',
          stackId: s.id,
        })
      }
    }
    if (augCount > 2) {
      out.push({
        id: 'aug-many',
        ruleId: 'aug-many',
        severity: 'warn',
        message: `Augmented chord used ${augCount} times — prefer other legal options.`,
      })
    }
    return out
  },
}

export const dimSustainRule: LintRule = {
  id: 'dim-sustain',
  check(project) {
    const out: ArrangementLint[] = []
    for (const s of project.stacks) {
      if (s.natureId === 'dim7' && s.durationTicks >= 480) {
        out.push({
          id: `dim-long-${s.id}`,
          ruleId: 'dim-sustain',
          severity: 'info',
          message: 'Long diminished sonority — usually better as a short transition.',
          stackId: s.id,
        })
      }
    }
    return out
  },
}

export const voicingIntegrityRule: LintRule = {
  id: 'voicing-integrity',
  check(project) {
    const out: ArrangementLint[] = []
    for (const s of project.stacks) {
      if (!s.midi) continue
      const tones = new Set(
        [s.midi.bass, s.midi.bari, s.midi.lead, s.midi.tenor].map((m) => ((m % 12) + 12) % 12),
      )
      if ((s.natureId === 'major' || s.natureId === 'minor') && tones.size < 3) {
        out.push({
          id: `incomplete-triad-${s.id}`,
          ruleId: 'incomplete-triad',
          severity: 'warn',
          message: 'Triad voicing may be missing a chord tone.',
          stackId: s.id,
        })
      }
      if (s.natureId === 'ninth' && tones.size < 4) {
        out.push({
          id: `thin-ninth-${s.id}`,
          ruleId: 'thin-ninth',
          severity: 'info',
          message: 'Ninth voicing has fewer than 4 pitch classes — check omit-root vs omit-5 choice.',
          stackId: s.id,
        })
      }
    }
    return out
  },
}

export const fewSeventhsRule: LintRule = {
  id: 'few-sevenths',
  check(project) {
    if (project.stacks.length < 8) return []
    const sevenths = project.stacks.filter(
      (s) => s.natureId === 'seventh' || s.natureId === 'ninth',
    ).length
    if (sevenths / project.stacks.length >= 0.15) return []
    return [
      {
        id: 'few-sevenths',
        ruleId: 'few-sevenths',
        severity: 'warn',
        message:
          'Few barbershop sevenths/ninths — consider secondary-dominant color toward pillars.',
      },
    ]
  },
}

export const phraseLengthRule: LintRule = {
  id: 'phrase-length',
  check(project) {
    return phraseLengthHint(project.melody).map((h) => ({
      id: h.id,
      ruleId: 'phrase-length',
      severity: h.severity,
      message: h.message,
    }))
  },
}

export const voiceLeadingRule: LintRule = {
  id: 'voice-leading',
  check(project) {
    return analyzeVoiceLeading(project.stacks).map((issue) => ({
      id: issue.id,
      ruleId: 'voice-leading',
      severity: issue.severity,
      message: issue.message,
      stackId: issue.stackId,
      teachingId: issue.teachingId,
    }))
  },
}

export {
  theorySpacingRule,
  theoryTensionRule,
  bs7DensityRule,
  bs7DensityDurationRule,
  dim7ChainRule,
  counterpartFlickerRule,
}

export const songEligibilityRule: LintRule = {
  id: 'song-eligibility',
  check(project) {
    return assessSongEligibility(project.melody).map((h) => ({
      id: h.id,
      ruleId: 'song-eligibility',
      severity: h.severity,
      message: h.message,
    }))
  },
}

export const strongVoicingRule: LintRule = {
  id: 'strong-voicing',
  check(project) {
    return strongVoicingLints(project.stacks, project.melody)
  },
}

export const harmonicMotionRule: LintRule = {
  id: 'harmonic-motion',
  check(project) {
    return motionLints(project)
  },
}

export const keySuggestionRule: LintRule = {
  id: 'key-suggestion',
  check(project) {
    return keySuggestionLints(project)
  },
}

export const orphanStackRule: LintRule = {
  id: 'orphan-stack',
  check(project) {
    return orphanStackLints(project)
  },
}

export const missingPillarRule: LintRule = {
  id: 'missing-pillar',
  check(project) {
    return missingPillarCoverageLints(project)
  },
}

export const swipeOpportunityRule: LintRule = {
  id: 'swipe-opportunity',
  check(project) {
    return swipeOpportunityLints(project)
  },
}

export const doubledThirdRule: LintRule = {
  id: 'doubled-third',
  check(project) {
    return doubledThirdLints(project.stacks)
  },
}

export const homophonyDensityRule: LintRule = {
  id: 'homophony-density',
  check(project) {
    return homophonyDensityLints(project)
  },
}

export const dullHarmonicityRule: LintRule = {
  id: 'dull-harmonicity',
  check(project) {
    return dullHarmonicityLints(project)
  },
}

export const copyrightReminderRule: LintRule = {
  id: 'copyright-reminder',
  check(project) {
    return copyrightReminderLint(project)
  },
}

export const DEFAULT_LINT_RULES: LintRule[] = [
  noMelodyRule,
  pillarsRule,
  leadRangeRule,
  illegalNatureRule,
  unrecognizedNatureRule,
  augUsageRule,
  dimSustainRule,
  voicingIntegrityRule,
  fewSeventhsRule,
  bs7DensityRule,
  bs7DensityDurationRule,
  dim7ChainRule,
  counterpartFlickerRule,
  phraseLengthRule,
  voiceLeadingRule,
  theorySpacingRule,
  theoryTensionRule,
  songEligibilityRule,
  strongVoicingRule,
  harmonicMotionRule,
  keySuggestionRule,
  orphanStackRule,
  missingPillarRule,
  swipeOpportunityRule,
  doubledThirdRule,
  homophonyDensityRule,
  dullHarmonicityRule,
  copyrightReminderRule,
]
