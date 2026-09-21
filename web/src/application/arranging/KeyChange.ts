import {
  combineKeyChangePaths,
  suggestKeyChanges,
  suggestKeyChangesGrouped,
  type SuggestKeyChangesOpts,
  type CombineKeyChangeOpts,
  type ModulationPath,
} from '../../domain/arranging/keyChange'

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
