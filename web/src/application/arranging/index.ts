export { inferPillars, confirmAllPillars } from './InferPillars'
export {
  autoHarmonize,
  listCandidatesForNote,
  applyCandidateToProject,
} from './AutoHarmonize'
export type { AutoHarmonizeDeps } from './AutoHarmonize'
export { runQa, lintSummary } from './RunQa'
export { applyFix, applyAllSafeFixes, canApplyFix } from './ApplyFix'
export { exportMidi } from './ExportMidi'
export type { ExportMidiResult } from './ExportMidi'
export { exportMusicXml } from './ExportMusicXml'
export type { ExportMusicXmlResult } from './ExportMusicXml'
export { autoLabelMelodyRoles } from './LabelMelodyRoles'
export { strengthenArrangement } from './Strengthen'
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
export { suggestModulation, suggestModulationGrouped, combineModulationPaths } from './KeyChange'
export { contextForSelectedMoment } from './CoachContext'
export type { MomentContextDto } from './CoachContext'
export { whyViewForCandidate } from './CandidateWhy'
export type { CandidateWhyView, WhyBullet, WhyFactorBar } from './CandidateWhy'
export {
  altChipsForMoment,
  candFilterLabels,
  counterpartForMoment,
  filterCandidates,
  layerHintForCandidate,
  pickCandidateForAltChip,
} from './CoachAlternates'
export type { AltChipDto, CandFilterId, CounterpartDto } from './CoachAlternates'
export { groupIssues, issueBoardSummary } from './IssueBoard'
export type { IssueGroup, IssueGroupId } from './IssueBoard'
export {
  GUIDED_STEPS,
  resolveGuidedStep,
  tipForGuidedStep,
  focusTabForGuidedStep,
} from './GuidedSteps'
export type { GuidedStepId } from './GuidedSteps'
