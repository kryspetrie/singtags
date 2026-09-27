import type { TagRollRoleDisplay } from './types'

export function roleDisplayShowsMelody(d: TagRollRoleDisplay | null | undefined): boolean {
  return d === 'melody' || d === 'both'
}

export function roleDisplayShowsRoles(d: TagRollRoleDisplay | null | undefined): boolean {
  return d === 'roles' || d === 'both'
}

export function roleDisplayFromToggles(melody: boolean, roles: boolean): TagRollRoleDisplay {
  if (melody && roles) return 'both'
  if (melody) return 'melody'
  if (roles) return 'roles'
  return 'off'
}

export function roleDisplayLabel(d: TagRollRoleDisplay | null | undefined): string {
  if (d === 'melody') return 'Melody'
  if (d === 'roles') return 'Roles'
  if (d === 'both') return 'Melody + Roles'
  return 'Off'
}
