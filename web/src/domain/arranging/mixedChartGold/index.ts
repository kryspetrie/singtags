export {
  MIXED_CHART_GOLD_SCHEMA,
  MIXED_GOLD_AUTO_LOCK_CONFIDENCE,
  MIXED_GOLD_VERIFIED_COVERAGE,
  type MixedAltCandidate,
  type MixedChartGold,
  type MixedGoldOverride,
  type MixedGoldOverridesFile,
  type MixedLabelSource,
  type MixedOnsetGold,
  type MixedOnsetMidi,
  type MixedOnsetRole,
} from './types'

export {
  applyGoldOverrides,
  buildGoldFromChart,
  computeLockCoverage,
  computeVerified,
  labelOnset,
  listAmbiguousOnsets,
  summarizeGold,
  type MixedGoldChartNote,
  type MixedGoldChartView,
} from './buildFromSeed'
