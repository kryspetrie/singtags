/**
 * Org-specific coach tips (BHS vs SAI; TTBB vs SSAA) — presentation DTOs only.
 */
import type { ContestProfile } from './types'

export type OrgTip = {
  id: string
  org: 'sai' | 'bhs' | 'learning' | 'general'
  ensemble: 'ttbb' | 'ssaa' | 'any'
  title: string
  body: string
}

export const ORG_TIPS: readonly OrgTip[] = [
  {
    id: 'sai-11',
    org: 'sai',
    ensemble: 'any',
    title: 'SAI / Rylander 11',
    body: 'Contest vocabulary stays on the eleven Rylander chords. Prefer BS7 lock-and-ring; treat aug/dim as short color.',
  },
  {
    id: 'bhs-extended',
    org: 'bhs',
    ensemble: 'any',
    title: 'BHS extended color',
    body: 'Half-diminished and diminished triads appear in BHS practice tables — still use sparingly as transitions.',
  },
  {
    id: 'ttbb-range',
    org: 'general',
    ensemble: 'ttbb',
    title: 'TTBB lead range',
    body: 'Men’s lead often lives roughly D3–F4. Flag extremes early and transpose before writing dense harmony.',
  },
  {
    id: 'ssaa-range',
    org: 'sai',
    ensemble: 'ssaa',
    title: 'SSAA lead range',
    body: 'Women’s lead sits higher (about G3–A5 comfort). Use the SSAA range preset when coaching Sweet Adelines charts.',
  },
  {
    id: 'learning-soft',
    org: 'learning',
    ensemble: 'any',
    title: 'Learning profile',
    body: 'Illegal chords become warnings so students can explore — switch to sai11/bhs_extended before contest export.',
  },
]

export function tipsForProfile(
  profile: ContestProfile,
  ensemble: 'ttbb' | 'ssaa' = 'ttbb',
): OrgTip[] {
  const org: OrgTip['org'] =
    profile === 'sai11' ? 'sai' : profile === 'bhs_extended' ? 'bhs' : 'learning'
  return ORG_TIPS.filter(
    (t) =>
      (t.org === org || t.org === 'general') &&
      (t.ensemble === ensemble || t.ensemble === 'any'),
  )
}
