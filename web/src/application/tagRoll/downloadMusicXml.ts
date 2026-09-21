import type { MusicXmlExporter } from '../../ports/MusicXmlExporter'
import type { TagRollProject } from '../../lib/tagRoll/types'
import { exportMusicXmlBytes } from './exportMusicXml'
import type { FileDownload } from './downloadMidi'

function defaultBrowserDownload(bytes: Uint8Array, filename: string, mime: string): void {
  const blob = new Blob(
    [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
    { type: mime },
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function safeTitle(project: TagRollProject): string {
  return project.title.replace(/[^\w\-]+/g, '_').slice(0, 40) || 'tag-roll'
}

/** Use-case: MusicXML bytes via MusicXmlExporter port, then browser download. */
export function downloadMusicXml(
  exporter: MusicXmlExporter,
  project: TagRollProject,
  download: FileDownload = defaultBrowserDownload,
): void {
  const bytes = exportMusicXmlBytes(exporter, project)
  download(
    bytes,
    `${safeTitle(project)}.musicxml`,
    'application/vnd.recordare.musicxml+xml',
  )
}
