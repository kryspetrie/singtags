import { getTagStudioServices } from '../../composition/tagStudio'

export function svc() {
  return getTagStudioServices()
}

export function now(): number {
  return svc().clock.now()
}

/** Avoid stacking unload flush listeners across Pinia remounts in tests. */
export const tagRollUnloadFlush = { bound: false }
