/**
 * Plain-language Why? DTO for candidate rows (UI renders only).
 */
import { explanationForCandidate } from './ExplainCoach'
import { explainCandidate } from '../../domain/arranging/coachCopy'
import type { HarmonizeCandidate, UnscoredCandidate } from '../../domain/arranging/harmonize/types'
import type { RankerDeps } from '../../domain/arranging/harmonize'
import { explainRankingBreakdown } from '../../domain/arranging/harmonize'

export type WhyBullet = {
  label: string
  whyItMatters: string
}

export type WhyFactorBar = {
  label: string
  /** 0..1 relative to strongest factor in this breakdown */
  relative: number
  whyItMatters: string
  /** Hidden unless Advanced “Show numbers” */
  raw?: number
}

export type CandidateWhyView = {
  headline: string
  summary: string
  bullets: WhyBullet[]
  factors: WhyFactorBar[]
}

const BULLET_PLAIN: { match: RegExp; label: string; why: string }[] = [
  {
    match: /Primary chord family|PCF/i,
    label: 'Fits the home chord',
    why: 'Stays in the pillar family so the phrase feels grounded.',
  },
  {
    match: /Secondary chord family|SCF/i,
    label: 'Passing color',
    why: 'Adds motion between home chords without stealing the destination.',
  },
  {
    match: /Barbershop seventh/i,
    label: 'Classic lock-and-ring seventh',
    why: 'The barbershop seventh is built to ring and carry in a quartet.',
  },
  {
    match: /most ringing|ring tier/i,
    label: 'Strong ringing chord type',
    why: 'Some chord types lock partials more easily — this ranks among the stronger ones.',
  },
  {
    match: /Closed voicing/i,
    label: 'Closed spacing',
    why: 'Tighter spacing usually blends more easily for a quartet.',
  },
  {
    match: /Spread voicing/i,
    label: 'Spread spacing',
    why: 'Wider spacing can sound bigger but is harder to balance.',
  },
  {
    match: /circle-of-fifths|R1/i,
    label: 'Strong root motion',
    why: 'Circle-of-fifths motion drives the ear toward the next home chord.',
  },
  {
    match: /chromatic root/i,
    label: 'Chromatic root step',
    why: 'A half-step root change can paint a smooth connection between chords.',
  },
  {
    match: /tritone root/i,
    label: 'Tritone root jump',
    why: 'A tritone leap is a bold color move — use when you want drama.',
  },
  {
    match: /Springboard/i,
    label: 'Springboard takeoff',
    why: 'From I or IV you can leap to many destinations — useful for fresh starts.',
  },
  {
    match: /harmonicity/i,
    label: 'Rings in tune',
    why: 'Partials line up so the chord locks and carries; muddy stacks fight the overtones.',
  },
]

const FACTOR_WHY: Record<string, string> = {
  harmonicity: 'How well the voicing locks and rings together.',
  motion: 'How naturally the parts move from the previous chord.',
  towardPillar: 'Whether the harmony aims at the next home chord.',
  ring: 'How strongly this chord type tends to ring in barbershop.',
  closed: 'Preference for tighter spacing when it still sounds clear.',
  contest: 'Contest-profile preference for this style of choice.',
}

function plainFromBullet(raw: string): WhyBullet {
  for (const row of BULLET_PLAIN) {
    if (row.match.test(raw)) return { label: row.label, whyItMatters: row.why }
  }
  return {
    label: raw.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim(),
    whyItMatters: 'This factor contributed to the ranking for this moment.',
  }
}

function factorWhy(label: string): string {
  const key = Object.keys(FACTOR_WHY).find((k) => label.toLowerCase().includes(k.toLowerCase()))
  return key ? FACTOR_WHY[key]! : 'Relative contribution to this candidate’s rank.'
}

/**
 * Build a Why? view: plain bullets + relative factor bars (no raw scores by default).
 */
export function whyViewForCandidate(
  candidate: HarmonizeCandidate,
  opts?: { unscored?: UnscoredCandidate; rankerDeps?: RankerDeps },
): CandidateWhyView {
  const taught = explanationForCandidate(candidate, opts)
  const shallow = explainCandidate(candidate)
  const bullets = shallow.bullets.map(plainFromBullet)

  let factors: WhyFactorBar[] = []
  if (opts?.unscored) {
    const breakdown = explainRankingBreakdown(opts.unscored, opts.rankerDeps)
    const max = Math.max(1e-6, ...breakdown.map((f) => Math.abs(f.value)))
    factors = breakdown.map((f) => ({
      label: f.label,
      relative: Math.min(1, Math.abs(f.value) / max),
      whyItMatters: factorWhy(f.label),
      raw: Math.round(f.value * 100) / 100,
    }))
  } else if (taught.factors?.length) {
    const max = Math.max(1e-6, ...taught.factors.map((f) => Math.abs(f.value)))
    factors = taught.factors.map((f) => ({
      label: f.label,
      relative: Math.min(1, Math.abs(f.value) / max),
      whyItMatters: f.hint ?? factorWhy(f.label),
      raw: f.value,
    }))
  }

  return {
    headline: taught.headline,
    summary: taught.body,
    bullets,
    factors,
  }
}
