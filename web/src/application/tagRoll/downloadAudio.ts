/**
 * Download Tag Studio audio renders (MP3/WAV) via the AudioBounce port.
 */
import { buildZip, downloadBlob } from '../../download/zip'
import type { AudioBounce, AudioBounceOpts } from '../../ports/AudioBounce'
import type { BounceFormat, BounceProgress } from '../../lib/tagRoll/audioBounce'
import type { TagRollProject } from '../../lib/tagRoll/types'

export type DownloadAudioOpts = {
  mix: boolean
  perPart: boolean
  partLeft: boolean
  format?: BounceFormat
  onProgress?: (p: BounceProgress) => void
}

function safeZipTitle(project: TagRollProject): string {
  return project.title.replace(/[^\w\-]+/g, '_').slice(0, 40) || 'tag-roll'
}

/** Use-case: bounce through AudioBounce, then download file or zip. */
export async function downloadAudio(
  audioBounce: AudioBounce,
  project: TagRollProject,
  opts: DownloadAudioOpts,
): Promise<void> {
  const format = opts.format ?? 'mp3'
  const bounceOpts: AudioBounceOpts = {
    mix: opts.mix || opts.partLeft,
    perPart: opts.perPart,
    partLeft: opts.partLeft,
    format,
    onProgress: opts.onProgress,
  }
  const tracks = await audioBounce.bounce(project, bounceOpts)
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
