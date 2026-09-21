import type { ArrangementProject } from '../../domain/arranging/types'
import type { ArrangementMusicXmlExportOptions, ArrangementMusicXmlExporter } from '../../ports/ArrangementMusicXmlExporter'
import { runQa } from './RunQa'

export type ExportMusicXmlResult =
  | { ok: true; xml: string }
  | { ok: false; reason: 'errors'; errorCount: number }

export function exportMusicXml(
  project: ArrangementProject,
  exporter: ArrangementMusicXmlExporter,
  opts: ArrangementMusicXmlExportOptions & { blockOnErrors?: boolean } = {},
): ExportMusicXmlResult {
  if (opts.blockOnErrors) {
    const lints = runQa(project)
    const errors = lints.filter((l) => l.severity === 'error')
    if (errors.length) return { ok: false, reason: 'errors', errorCount: errors.length }
  }
  return { ok: true, xml: exporter.export(project, opts) }
}
