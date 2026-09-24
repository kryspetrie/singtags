export type {
  CadenceBias,
  CadenceCandidate,
  CadenceContext,
  CadenceDef,
  CadenceHint,
  CadenceId,
  CadenceMatch,
  CadencePriority,
  LockedNeighbor,
  PhraseRole,
} from './types'
export { CADENCE_CATALOG, cadenceById, cadenceTonics } from './catalog'
export {
  scoreCadenceFit,
  cadenceHintForContext,
  cadenceMissMessage,
  type CadenceScoreOpts,
  type CadenceScoreResult,
} from './score'
export {
  inferPhraseRole,
  phraseRoleAtMelodyIndex,
  type PhraseRoleInput,
} from './phraseRole'
export { loadCadenceBias, saveCadenceBias, scaleForBias } from './prefs'
