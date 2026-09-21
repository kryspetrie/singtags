import type { TagRollProject } from '../lib/tagRoll/types'
import type { MidiExportMode, MidiExportOptions } from '../lib/tagRoll/midiExport'

export type { MidiExportMode, MidiExportOptions }

/** Port: TagRoll project → SMF bytes. */
export interface MidiExporter {
  export(
    project: TagRollProject,
    mode?: MidiExportMode,
    options?: MidiExportOptions,
  ): Uint8Array
}
