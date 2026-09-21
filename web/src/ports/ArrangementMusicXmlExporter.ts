import type { ArrangementProject } from '../domain/arranging/types'
import type { ScoreLayout } from '../domain/arranging/musicxml/projectToScoreModel'

export type ArrangementMusicXmlExportOptions = {
  layout?: ScoreLayout
  includeLyrics?: boolean
  includeChordSymbols?: boolean
}

/** Port: arrangement → MusicXML 3.1 partwise string. */
export interface ArrangementMusicXmlExporter {
  export(project: ArrangementProject, options?: ArrangementMusicXmlExportOptions): string
}
