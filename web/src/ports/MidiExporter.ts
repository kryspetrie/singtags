import type { TagRollProject } from '../lib/tagRoll/types'
import type { MidiExportMode } from '../lib/tagRoll/midiExport'

export type { MidiExportMode }

/** Port: TagRoll project → SMF bytes. */
export interface MidiExporter {
  export(project: TagRollProject, mode?: MidiExportMode): Uint8Array
}
