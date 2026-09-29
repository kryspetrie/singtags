import { coachRollNavStepMoment } from './coachRollNav'

/** ←/→ while Coach is open: step harmonic moments (not L/R inspect bounds). */
export function tryCoachArrowStepMoment(
  key: string,
  coaching: boolean,
  shiftKey: boolean,
): boolean {
  if (!coaching || shiftKey) return false
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return false
  coachRollNavStepMoment(key === 'ArrowLeft' ? -1 : 1)
  return true
}
