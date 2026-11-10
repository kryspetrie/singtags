import { describe, expect, it } from 'vitest'
import { buildTunerExportSnapshot, tunerExportToCsv } from './exportSchema'

describe('exportSchema', () => {
  it('builds versioned snapshot with Conditional provenance', () => {
    const snap = buildTunerExportSnapshot({
      a4Hz: 440,
      keyPc: 0,
      keyGridTemperament: 'equal',
      chordLockEnabled: false,
      chordNatureId: null,
      surface: 'fft',
      rows: [{ hz: 440, note: 'A4', cents: 0, salience: 1 }],
    })
    expect(snap.schema).toBe('singtags.tuner.export.v1')
    expect(snap.provenance.killGate).toBe('conditional')
    expect(tunerExportToCsv(snap)).toMatch(/440\.000,A4,0\.00,,1\.000/)
  })
})
