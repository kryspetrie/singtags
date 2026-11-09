/**
 * Audio and files for My Library and recordings.
 * Stored by content hash under appDataFolder/singtags/user-blobs/.
 */
import {
  downloadFileBytes,
  ensureAppDataPath,
  findChildByName,
  uploadAppDataBytes,
} from './driveAppData'
import {
  readLibraryBlob,
  readRecordingBlob,
  readRecordingOriginal,
  type UserBlobRef,
  type UserDocumentsFile,
} from '../userDocuments'

const BLOB_SEGMENTS = ['singtags', 'user-blobs'] as const

async function uploadRef(ref: UserBlobRef, bytes: Uint8Array | null): Promise<void> {
  if (!bytes || !ref.sha256) return
  const folderId = await ensureAppDataPath(BLOB_SEGMENTS)
  await uploadAppDataBytes({
    name: ref.sha256,
    parentId: folderId,
    mimeType: 'application/octet-stream',
    bytes,
  })
}

async function mapPool<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  const runners = Array.from({ length: Math.min(3, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor]
      cursor += 1
      if (item) await worker(item)
    }
  })
  await Promise.all(runners)
}

/** Upload any library or recording bytes that Drive does not have yet. */
export async function ensureUserBlobsUploaded(docs: UserDocumentsFile | undefined): Promise<void> {
  if (!docs) return
  const jobs: Array<() => Promise<void>> = []
  for (const ref of docs.library.blobs) {
    jobs.push(async () => uploadRef(ref, await readLibraryBlob(ref.id)))
  }
  for (const ref of docs.recordings.blobs) {
    jobs.push(async () => uploadRef(ref, await readRecordingBlob(ref.id)))
  }
  for (const ref of docs.recordings.originals) {
    jobs.push(async () => uploadRef(ref, await readRecordingOriginal(ref.id)))
  }
  await mapPool(jobs, (job) => job())
}

export async function downloadUserBlob(sha256: string): Promise<Uint8Array | null> {
  if (!sha256) return null
  const folderId = await ensureAppDataPath(BLOB_SEGMENTS)
  const file = await findChildByName(sha256, folderId)
  if (!file) return null
  return downloadFileBytes(file.id)
}
