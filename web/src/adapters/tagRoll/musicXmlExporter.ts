import { exportTagRollMusicXml } from '../../lib/tagRoll/musicxmlExport'
import type { MusicXmlExporter } from '../../ports/MusicXmlExporter'
import type { TagRollProject } from '../../lib/tagRoll/types'

export function createMusicXmlExporter(): MusicXmlExporter {
  return {
    export(project: TagRollProject): Uint8Array {
      return exportTagRollMusicXml(project)
    },
  }
}
