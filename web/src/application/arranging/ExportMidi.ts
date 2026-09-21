import type { ArrangementProject } from '../../domain/arranging/types'
import type { ArrangementMidiExportOptions, ArrangementMidiExporter } from '../../ports/ArrangementMidiExporter'
import { runQa } from './RunQa'

export type ExportMidiResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: 'errors'; errorCount: number }

/**
 * Export MIDI; optionally block when unresolved error lints exist.
 */
export function exportMidi(
  project: ArrangementProject,
  exporter: ArrangementMidiExporter,
  opts: ArrangementMidiExportOptions & { blockOnErrors?: boolean } = {},
): ExportMidiResult {
  if (opts.blockOnErrors) {
    const lints = runQa(project)
    const errors = lints.filter((l) => l.severity === 'error')
    if (errors.length) return { ok: false, reason: 'errors', errorCount: errors.length }
  }
  return { ok: true, bytes: exporter.export(project, opts) }
}
