export interface OfflineManifestEntry {
  tagId: number
  paths: string[]
  bytes: number
  /** Present for sheets pack — relative path to metadata.json */
  detailPath?: string
}

export interface OfflineManifest {
  version: number
  kind: 'sheets' | 'audio'
  builtAt: string
  totalBytes: number
  entries: OfflineManifestEntry[]
}
