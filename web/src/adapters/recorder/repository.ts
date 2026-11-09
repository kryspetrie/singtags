/**
 * Recorder persistence adapter.
 * The Pinia store talks to this module; IndexedDB stays behind it.
 */
export {
  appendRecorderTake,
  clearAllRecorderCropBackups,
  deleteRecorderCropBackup,
  deleteRecorderSession,
  deleteRecorderTake,
  ensureRecorderOriginal,
  getAnyRecorderCropBackup,
  getRecorderBlob,
  getRecorderSession,
  hasRecorderOriginalDiff,
  listRecorderSessions,
  listTakesForSession,
  newRecorderSessionId,
  newRecorderTakeId,
  putRecorderCropBackup,
  putRecorderSession,
  putRecorderTake,
  sumRecorderTakeBytesFromMeta,
} from '../../offline/recorderDb'
