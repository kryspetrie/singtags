/**
 * Explain why a harmonize candidate ranked where it did (DTO for UI).
 */
import { ringTier } from './contestProfile'
import type { HarmonizeCandidate } from './harmonize/types'

export type CandidateWhy = {
  score: number
  harmonicity?: number
  bullets: string[]
  ruleTags: string[]
}

export function explainCandidate(c: HarmonizeCandidate): CandidateWhy {
  const bullets: string[] = []
  if (c.layer === 'primary') bullets.push('Primary chord family (PCF) on the pillar root')
  else if (c.scfGroup != null) bullets.push(`Secondary chord family group ${c.scfGroup}`)
  const tier = ringTierLabel(ringTier(c.natureId))
  bullets.push(`${c.natureId} — ${tier} ring tier`)
  if (c.natureId === 'seventh') bullets.push('Barbershop seventh — core lock-and-ring sonority')
  if (!c.spread) bullets.push('Closed voicing preferred for blend')
  else bullets.push('Spread voicing')
  if (c.ruleTags.includes('R1_p5')) bullets.push('Approach Three: circle-of-fifths / secondary dominant motion')
  if (c.ruleTags.includes('R2_chromatic')) bullets.push('Approach Three: chromatic root motion')
  if (c.ruleTags.includes('R3_tritone')) bullets.push('Approach Three: tritone root motion')
  if (c.ruleTags.includes('springboard')) bullets.push('Springboard root (I/IV free takeoff)')
  if (c.harmonicity != null) {
    bullets.push(`Just-intonation harmonicity ${c.harmonicity.toFixed(2)} (partial coincidence)`)
  }
  return {
    score: c.score,
    harmonicity: c.harmonicity,
    bullets,
    ruleTags: [...c.ruleTags],
  }
}

function ringTierLabel(tier: number): string {
  if (tier <= 1) return 'most ringing'
  if (tier <= 3) return 'strong'
  if (tier <= 5) return 'useful / transitional'
  return 'last-resort'
}
