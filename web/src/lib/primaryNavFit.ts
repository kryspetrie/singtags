/**
 * Shared runtime capacity for how many primary-nav pins fit on the current
 * chrome (bottom bar or desktop topnav). Persisted preference may be higher;
 * display clamps to this value and spills the rest into More.
 */
import { ref } from 'vue'
import { PRIMARY_NAV_PIN_COUNT, normalizePrimaryNavPinCount } from './primaryNav'

/** Max pins that currently fit (excludes More). Updated by App shell measure. */
export const primaryNavFitCapacity = ref(PRIMARY_NAV_PIN_COUNT)

export function setPrimaryNavFitCapacity(n: number): void {
  primaryNavFitCapacity.value = normalizePrimaryNavPinCount(n)
}
