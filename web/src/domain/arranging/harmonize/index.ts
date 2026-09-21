export type { HarmonizeCandidate, UnscoredCandidate } from './types'
export { generateCandidates } from './candidateGenerator'
export type { GenerateCandidatesInput } from './candidateGenerator'
export { rankCandidates, createCandidateRanker, explainRankingBreakdown } from './candidateRanker'
export type { RankerDeps } from './candidateRanker'
export { voiceLeadScore } from '../theoryScores'
export {
  candidatesForMelodyNote,
  autoHarmonizeMelody,
  candidateToStack,
} from './autoHarmonize'
export type { CandidatesForNoteOpts } from './autoHarmonize'
export {
  autocompleteNextChord,
  autocompleteSubstitutionChips,
} from './chordAutocomplete'
