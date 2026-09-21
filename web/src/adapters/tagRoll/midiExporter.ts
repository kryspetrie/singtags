import { exportTagRollMidi, type MidiExportMode, type MidiExportOptions } from '../../lib/tagRoll/midiExport'
import type { MidiExporter } from '../../ports/MidiExporter'
import type { TagRollProject } from '../../lib/tagRoll/types'

export function createMidiExporter(): MidiExporter {
  return {
    export(
      project: TagRollProject,
      mode: MidiExportMode = 'one',
      options?: MidiExportOptions,
    ): Uint8Array {
      return exportTagRollMidi(project, mode, options)
    },
  }
}
