import type { MidiExporter, MidiExportMode, MidiExportOptions } from '../../ports/MidiExporter'
import type { TagRollProject } from '../../lib/tagRoll/types'
import { exportMidiBytes } from './exportMidi'

export type { MidiExportMode, MidiExportOptions }

export type FileDownload = (bytes: Uint8Array, filename: string, mime: string) => void

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

/** Use-case: MIDI bytes via MidiExporter port, then browser download. */
export function downloadMidi(
  exporter: MidiExporter,
  project: TagRollProject,
  mode: MidiExportMode = 'one',
  download: FileDownload = defaultBrowserDownload,
  options?: MidiExportOptions,
): void {
  const bytes = exportMidiBytes(exporter, project, mode, options)
  download(bytes, `${safeTitle(project)}.mid`, 'audio/midi')
}
