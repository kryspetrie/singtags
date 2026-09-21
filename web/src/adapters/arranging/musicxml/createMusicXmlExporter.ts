import { projectToScoreModel } from '../../../domain/arranging/musicxml/projectToScoreModel'
import { scoreModelToMusicXml } from './arrangementMusicXmlExporter'
import type { ArrangementMusicXmlExportOptions, ArrangementMusicXmlExporter } from '../../../ports/ArrangementMusicXmlExporter'

export function createArrangementMusicXmlExporter(): ArrangementMusicXmlExporter {
  return {
    export(project, options: ArrangementMusicXmlExportOptions = {}) {
      const model = projectToScoreModel(project, options.layout ?? 'ttbb')
      return scoreModelToMusicXml(model)
    },
  }
}
