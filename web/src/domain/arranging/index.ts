export * from './types'
export * from './chords'
export * from './snap'
export * from './approachThree'
export * from './scf'
export * from './contestProfile'
export * from './coachConfig'
export * from './coachEntryMode'
export * from './mergeMelodyRoles'
export * from './mergeStacksFromRoll'
export * from './chordAnalysisBar'
export * from './impliedMelodyChord'
export * from './pillars'
export {
  candidatePillarPositions,
  nextHomeRootProposal,
  proposeRootForSpan,
  scoreRootsForNotes,
  spanKey,
} from './proposePillarAt'
export type { ProposeSpan } from './proposePillarAt'
export {
  deriveStrongHomes,
  ensureHomesFromStrongNotes,
  majorHomeDeg,
  proposeRootForStrongNote,
  rankStrongHomeAlternatives,
  scaleDegree,
  STRONG_HOME_CONF_LOCK,
  strongHomesToPillars,
} from './proposeStrongRoots'
export { decodeStrongHomesCo5UnderLocks } from './strongRootCo5'
export type { StrongHome } from './proposeStrongRoots'
export {
  bareMajorHomeDeg,
  barsFromPhraseStart,
  durationBucket,
  intervalClass,
  lookupStrongRootPrior,
} from './strongRootPriors'
export { rerankStrongHomesCadence } from './strongRootCadence'
export {
  segmentChordToneDiversity,
  segmentChordToneFit,
  segmentEmissionBonus,
} from './segmentEmission'
export * from './justIntonation'
export * from './harmonize'
export * from './harmonicity/harmonicityScore'
export * from './qa'
export * from './voiceLeading'
export * from './songEligibility'
export * from './strongVoicing'
export * from './coachCopy'
export * from './coachTips'
export * from './compareHear'
export * from './history'
export * from './melodyRoles'
export * from './motionAndKey'
export * from './strengthen'
export * from './syncStacks'
export * from './orgTips'
export * from './embellishments'
export * from './denseQa'
export * from './education'
export * from './bridge/tagRollBridge'
export * from './bridge/tagRollTypes'
export * from './selection'
export * from './clipboard'
export * from './finalChecklist'
export * from './polishVoicing'
export * from './musicxml/projectToScoreModel'
export * from './musicxml/scoreModel'
export * from './secondaryDominant'
export * from './counterpart'
export * from './substitutions'
export * from './barbershopness'
export * from './tensionRelease'
export * from './cadences'
export * from './cadenceCoachTip'
export * from './pathOptimize'
export * from './analyzeHarmonyTheory'
export * from './chordSuggestion'
export * from './chordCompletion'
export * from './spacing/harmonicSeriesSpacing'
export * from './partWritingCosts'
export * from './progressionAnalyze'
export * from './keyChange'
export * from './keyChangeForm'
export * from './dim7Hints'
export {
  autocompleteNextChord,
  autocompleteSubstitutionChips,
} from './harmonize/chordAutocomplete'
