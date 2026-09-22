/**
 * Preserve coach session fields when re-importing from a live Tag Studio roll.
 */
import type { ArrangementProject } from '../../domain/arranging/types'
import { mergeMelodyRoles } from '../../domain/arranging/mergeMelodyRoles'
import { mergeStacksFromRollImport } from '../../domain/arranging/mergeStacksFromRoll'

export function mergeCoachSessionFromExisting(
  fresh: ArrangementProject,
  existing: ArrangementProject,
): ArrangementProject {
  fresh.pillars = existing.pillars
  fresh.wizardStep = existing.wizardStep
  fresh.contestProfile = existing.contestProfile
  fresh.tuningMode = existing.tuningMode
  fresh.qaConfig = existing.qaConfig
  fresh.melody = mergeMelodyRoles(fresh.melody, existing.melody)
  fresh.stacks = mergeStacksFromRollImport(fresh.stacks, existing.stacks)
  return fresh
}
