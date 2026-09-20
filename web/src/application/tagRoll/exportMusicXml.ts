import type { MusicXmlExporter } from '../../ports/MusicXmlExporter'
import type { TagRollProject } from '../../lib/tagRoll/types'

/** Use-case: export TagRoll → MusicXML bytes through the MusicXmlExporter port. */
export function exportMusicXmlBytes(
  exporter: MusicXmlExporter,
  project: TagRollProject,
): Uint8Array {
  return exporter.export(project)
}
