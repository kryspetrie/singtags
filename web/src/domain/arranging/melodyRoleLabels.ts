/**
 * User-facing labels for melody note weight (Approach Two PMN/SMN).
 * Keep `pmn` / `smn` ids in data; never show those acronyms in primary UI.
 */
import type { MelodyRole } from './types'

/** Short chip / lane mark. */
export function melodyRoleShortLabel(role: MelodyRole): string {
  if (role === 'pmn') return 'Strong'
  if (role === 'smn') return 'Passing'
  return '?'
}

/** Button / detail label. */
export function melodyRoleLongLabel(role: MelodyRole): string {
  if (role === 'pmn') return 'Strong — home tone'
  if (role === 'smn') return 'Passing — connective'
  return 'Unlabeled'
}

/** Coach-lane one/two-letter mark. */
export function melodyRoleLaneMark(role: MelodyRole): string {
  if (role === 'pmn') return 'St'
  if (role === 'smn') return 'Pa'
  return ''
}
