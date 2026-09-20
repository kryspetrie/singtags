import type { TagRollProject } from '../lib/tagRoll/types'

/** Port: TagRoll project → MusicXML partwise bytes. */
export interface MusicXmlExporter {
  export(project: TagRollProject): Uint8Array
}
