/**
 * Download Tag Studio audio renders (MP3/WAV) as a single file or zip.
 */
import { bounceTagRollTracks, type BounceFormat, type BounceProgress } from './audioBounce'
import { buildZip, downloadBlob } from '../../download/zip'
import type { TagRollProject } from './types'

export type AudioExportOpts = {
  mix: boolean
  perPart: boolean
  partLeft: boolean
  format?: BounceFormat
  onProgress?: (p: BounceProgress) => void
}

function safeZipTitle(project: TagRollProject): string {
  return project.title.replace(/[^\w\-]+/g, '_').slice(0, 40) || 'tag-roll'
}

export async function downloadTagRollAudio(
  project: TagRollProject,
  opts: AudioExportOpts,
): Promise<void> {
  const format = opts.format ?? 'mp3'
  // Part-left learning packs always include Mix (same as Tag offline sets).
  const tracks = await bounceTagRollTracks(project, {
    mix: opts.mix || opts.partLeft,
    perPart: opts.perPart,
    partLeft: opts.partLeft,
    format,
    onProgress: opts.onProgress,
  })
  if (!tracks.length) throw new Error('Nothing to render — add notes first')

  const mime = format === 'mp3' ? 'audio/mpeg' : 'audio/wav'
  if (tracks.length === 1) {
    const t = tracks[0]!
    downloadBlob(new Uint8Array(t.bytes), t.filename, mime)
    return
  }

  const zip = buildZip(
    tracks.map((t) => ({
      name: t.filename,
      data: new Uint8Array(t.bytes),
    })),
  )
  const suffix = [
    opts.partLeft ? 'part-left' : null,
    opts.mix && !opts.partLeft ? 'mix' : null,
    opts.perPart ? 'parts' : null,
  ]
    .filter(Boolean)
    .join('+')
  downloadBlob(zip, `${safeZipTitle(project)}-${suffix || 'audio'}.zip`, 'application/zip')
}
