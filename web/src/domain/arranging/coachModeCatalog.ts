/**
 * Legacy Arrange/Review card copy (mode still used internally by tips / next-action).
 * Coach UI now uses the ordered GuidedSteps rail instead of a mode landing.
 */
import type { CoachUiMode } from './coachTips'
import type { CoachFocusTab } from './nextCoachAction'

export type CoachModeCard = {
  id: CoachUiMode
  title: string
  tagline: string
  body: string
  defaultFocus: CoachFocusTab
}

export const COACH_MODE_CARDS: readonly CoachModeCard[] = [
  {
    id: 'arrange',
    title: 'Arrange',
    tagline: 'Build the chart',
    body: 'Pillars → roles → chords along the step rail.',
    defaultFocus: 'now',
  },
  {
    id: 'review',
    title: 'Review',
    tagline: 'Check and polish',
    body: 'Clear issues, then polish and export.',
    defaultFocus: 'check',
  },
]

export function coachModeCard(id: CoachUiMode): CoachModeCard {
  return COACH_MODE_CARDS.find((c) => c.id === id) ?? COACH_MODE_CARDS[0]!
}
