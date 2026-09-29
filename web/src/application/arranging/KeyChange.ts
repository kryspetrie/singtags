import {
  combineKeyChangePaths,
  suggestKeyChanges,
  suggestKeyChangesGrouped,
  type SuggestKeyChangesOpts,
  type CombineKeyChangeOpts,
  type ModulationPath,
} from '../../domain/arranging/keyChange'
import { suggestPostKeyChanges } from '../../domain/arranging/keyChangePosts'

/** Suggest modulation paths between two keys (abrupt→extended, plus hybrids). */
export function suggestModulation(opts: SuggestKeyChangesOpts) {
  return suggestKeyChanges(opts)
}

export function suggestModulationGrouped(opts: SuggestKeyChangesOpts) {
  return suggestKeyChangesGrouped(opts)
}

/** Splice two paths into a mid-style (or multi-hop) hybrid. */
export function combineModulationPaths(
  first: ModulationPath,
  second: ModulationPath,
  opts?: CombineKeyChangeOpts,
) {
  return combineKeyChangePaths(first, second, opts)
}

/** Common-tone / Lead-post modulation paths. */
export function suggestPostModulation(
  opts: Parameters<typeof suggestPostKeyChanges>[0],
) {
  return suggestPostKeyChanges(opts)
}
