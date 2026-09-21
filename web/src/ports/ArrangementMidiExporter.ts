import type { ArrangementProject } from '../domain/arranging/types'

export type ArrangementMidiExportOptions = {
  /** Apply just-intonation pitch bends per TTBB channel. */
  justIntonation?: boolean
  bendRangeSemitones?: number
}

/** Port: arrangement → SMF bytes. */
export interface ArrangementMidiExporter {
  export(project: ArrangementProject, options?: ArrangementMidiExportOptions): Uint8Array
}
