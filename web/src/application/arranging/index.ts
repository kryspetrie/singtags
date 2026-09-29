export { inferPillars, confirmAllPillars } from './InferPillars'
export {
  autoHarmonize,
  listCandidatesForNote,
  applyCandidateToProject,
  resolveSuggestHomeRoot,
} from './AutoHarmonize'
export type { AutoHarmonizeDeps, SoftSuggestContext, ListCandidatesOpts } from './AutoHarmonize'
export { runQa, lintSummary } from './RunQa'
export { applyFix, applyAllSafeFixes, canApplyFix } from './ApplyFix'
export { exportMidi } from './ExportMidi'
export type { ExportMidiResult } from './ExportMidi'
export { exportMusicXml } from './ExportMusicXml'
export type { ExportMusicXmlResult } from './ExportMusicXml'
export { autoLabelMelodyRoles } from './LabelMelodyRoles'
export { strengthenArrangement } from './Strengthen'
export { polishInversionPath } from './PolishInversionPath'
export {
  explanationForWizardStep,
  explanationForLint,
  explanationForCandidate,
  explanationAfterFix,
} from './ExplainCoach'
export type { CoachExplanationDto } from './ExplainCoach'
export {
  createProject,
  persistProjects,
  loadProjects,
  deleteProject,
} from './ProjectCrud'
export { upsertMelodyNote, removeMelodyNote, setProjectMeta } from './UpdateMelody'
export {
  suggestEmbellishments,
  applyEmbellishment,
  polishArrangementVoicing,
  assessFinal,
  assessHowBarbershop,
  listSubstitutionsForNote,
  suggestCounterpartForStack,
  applyCounterpart,
  romanLabelForStack,
  copyArrangementSelection,
  cutArrangementSelection,
  pasteArrangementClipboard,
} from './DocumentOps'
export {
  autocompleteChordAtNote,
  listTheorySubstitutionChips,
  completeChordFromPitches,
  repairProjectStack,
  runHarmonyTheoryAnalysis,
  explainProjectStackTheory,
  analyzeProjectProgression,
  teachArrangementAnalysis,
  teachStackAnalysis,
} from './TheoryAssist'
export { suggestModulation, suggestModulationGrouped, combineModulationPaths, suggestPostModulation } from './KeyChange'
export { prepareModulationApply, pickModulationPath, packedToSketchPatches, listModulationOptions } from './KeyChangeApply'
export { voiceModulationHearPath } from './KeyChangeHear'
export type { MelodyLeadHint } from './KeyChangeHear'
export type {
  PrepareModulationApplyOpts,
  PrepareModulationApplyResult,
  ModulationSketchPatch,
  ModulationOption,
} from './KeyChangeApply'
export {
  listCadencePlans,
  planToSketchPatches,
  planStepToSketchPatch,
} from './CadencePlans'
export type { CadenceSketchPatch, CadencePlanApplyResult } from './CadencePlans'
export { contextForSelectedMoment } from './CoachContext'
export type { MomentContextDto } from './CoachContext'
export { whyViewForCandidate } from './CandidateWhy'
export type { CandidateWhyView, WhyBullet, WhyFactorBar } from './CandidateWhy'
export {
  altChipsForMoment,
  candFilterLabels,
  counterpartForMoment,
  dedupeHarmonizeCandidates,
  filterCandidates,
  groupCandidatesByChord,
  layerHintForCandidate,
  pickCandidateForAltChip,
} from './CoachAlternates'
export type { AltChipDto, CandFilterId, CounterpartDto } from './CoachAlternates'
export { groupIssues, issueBoardSummary } from './IssueBoard'
export type { IssueGroup, IssueGroupId } from './IssueBoard'
export {
  GUIDED_STEPS,
  resolveGuidedStep,
  resolveGuidedStepWithLints,
  tipForGuidedStep,
  labelForGuidedStep,
  focusTabForGuidedStep,
  modeForGuidedStep,
  wizardStepForGuided,
  normalizeGuidedStepId,
} from './GuidedSteps'
export type { GuidedStepId, GuidedStepDef, ResolveGuidedOpts } from './GuidedSteps'
export {
  detectCoachEntryMode,
  knownStackCoverage,
  knownStackCount,
  isKnownStack,
} from '../../domain/arranging/coachEntryMode'
export type { CoachEntryMode } from '../../domain/arranging/coachEntryMode'
