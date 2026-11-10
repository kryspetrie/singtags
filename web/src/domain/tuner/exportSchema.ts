/**
 * Digital Tuner export provenance schema (Phase 8).
 * Settings + snapshot metadata only — never PCM history.
 */

export type TunerExportSnapshotV1 = {
  schema: 'singtags.tuner.export.v1'
  exportedAt: string
  a4Hz: number
  keyPc: number
  keyGridTemperament: string
  chordLockEnabled: boolean
  chordNatureId: string | null
  surface: 'tune' | 'chord' | 'fft' | 'spectrogram'
  /** Optional peak / tone rows for CSV/JSON. */
  rows: Array<{
    hz: number
    note?: string
    cents?: number
    role?: number
    salience?: number
  }>
  provenance: {
    engine: 'classical'
    killGate: 'conditional' | 'go' | 'no-go'
    app: 'singtags'
  }
}

export function buildTunerExportSnapshot(
  partial: Omit<TunerExportSnapshotV1, 'schema' | 'exportedAt' | 'provenance'> & {
    killGate?: TunerExportSnapshotV1['provenance']['killGate']
  },
): TunerExportSnapshotV1 {
  return {
    schema: 'singtags.tuner.export.v1',
    exportedAt: new Date().toISOString(),
    a4Hz: partial.a4Hz,
    keyPc: partial.keyPc,
    keyGridTemperament: partial.keyGridTemperament,
    chordLockEnabled: partial.chordLockEnabled,
    chordNatureId: partial.chordNatureId,
    surface: partial.surface,
    rows: partial.rows ?? [],
    provenance: {
      engine: 'classical',
      killGate: partial.killGate ?? 'conditional',
      app: 'singtags',
    },
  }
}

/** CSV body for a snapshot (header + rows). */
export function tunerExportToCsv(snap: TunerExportSnapshotV1): string {
  const lines = ['hz,note,cents,role,salience']
  for (const r of snap.rows) {
    lines.push(
      [
        r.hz.toFixed(3),
        r.note ?? '',
        r.cents == null ? '' : r.cents.toFixed(2),
        r.role == null ? '' : String(r.role),
        r.salience == null ? '' : r.salience.toFixed(3),
      ].join(','),
    )
  }
  return lines.join('\n')
}
