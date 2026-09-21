import type { MidiExporter, MidiExportMode, MidiExportOptions } from '../../ports/MidiExporter'
import type { TagRollProject } from '../../lib/tagRoll/types'

/** Use-case: export TagRoll → MIDI bytes through the MidiExporter port. */
export function exportMidiBytes(
  exporter: MidiExporter,
  project: TagRollProject,
  mode: MidiExportMode = 'one',
  options?: MidiExportOptions,
): Uint8Array {
  return exporter.export(project, mode, options)
}
