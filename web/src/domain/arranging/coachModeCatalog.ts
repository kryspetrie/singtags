/**
 * Session mode catalog for the Coach landing screen.
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

/** Ordered Quick → Guided → Review. */
export const COACH_MODE_CARDS: readonly CoachModeCard[] = [
  {
    id: 'quick',
    title: 'Quick',
    tagline: 'Arrange fast',
    body: 'Suggest and lock home chords (pillars), walk moments with ranked picks, and fix blockers. Teaching chrome stays out of the way.',
    defaultFocus: 'choose',
  },
  {
    id: 'guided',
    title: 'Guided',
    tagline: 'Learn while you arrange',
    body: 'Follow a short path: pillars → roles → chords. Tips and Why? explain each choice; still free to step moments yourself.',
    defaultFocus: 'now',
  },
  {
    id: 'review',
    title: 'Review',
    tagline: 'Check and polish',
    body: 'Inspect issues in the selected range, strengthen voicings, and export. Ranked suggestions are optional when you open Choose.',
    defaultFocus: 'check',
  },
]

export function coachModeCard(id: CoachUiMode): CoachModeCard {
  return COACH_MODE_CARDS.find((c) => c.id === id) ?? COACH_MODE_CARDS[0]!
}
