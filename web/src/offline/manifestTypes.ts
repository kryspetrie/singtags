/**
 * Shared shape for tier-2 offline pack manifests (sheets and audio).
 *
 * Manifests are fetched from the server and drive {@link DownloadQueue} item lists.
 */

/** One tag's worth of paths included in a pack manifest. */
export interface OfflineManifestEntry {
  tagId: number
  /** Relative media paths belonging to this tag. */
  paths: string[]
  /** Sum of file sizes in bytes (informational for progress UI). */
  bytes: number
  /** Present for sheets pack — relative path to `metadata.json`. */
  detailPath?: string
}

/** Server-built manifest describing a downloadable offline pack. */
export interface OfflineManifest {
  version: number
  kind: 'sheets' | 'audio'
  /** ISO timestamp when the manifest was generated. */
  builtAt: string
  /** Total bytes across all entries. */
  totalBytes: number
  entries: OfflineManifestEntry[]
}
