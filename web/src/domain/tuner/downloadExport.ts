/**
 * Build + trigger a Digital Tuner export download (JSON + CSV sidecar text).
 */
import type { ChordStackScore } from './chordStack'
import type { TuneReading } from './tuneTarget'
import { buildTunerExportSnapshot, tunerExportToCsv } from './exportSchema'
import type { FftPeak } from '../../audio/tuner/fftPeaks'
import type { DigitalTunerPrefs } from '../../lib/preferences/digitalTuner'

export function downloadTunerExport(opts: {
  surface: DigitalTunerPrefs['analyzeSurface']
  a4Hz: number
  prefs: DigitalTunerPrefs
  fftPeaks: readonly FftPeak[]
  chordScore: ChordStackScore | null
  reading: TuneReading | null
}): void {
  const surfaceLabel =
    opts.surface === 'chord'
      ? 'chord'
      : opts.surface === 'fft'
        ? 'fft'
        : opts.surface === 'spectrogram'
          ? 'spectrogram'
          : 'tune'
  const rows =
    opts.surface === 'fft'
      ? opts.fftPeaks.map((p) => ({
          hz: p.hz,
          note: p.note ?? undefined,
          cents: p.errorCents ?? undefined,
          salience: p.salience,
        }))
      : opts.surface === 'chord' && opts.chordScore
        ? opts.chordScore.tones.map((t) => ({
            hz: t.hz,
            note: t.note,
            cents: t.errorCentsVsJi,
            role: t.role,
          }))
        : opts.reading
          ? [
              {
                hz: opts.reading.targetHz * 2 ** (opts.reading.errorCents / 1200),
                note: opts.reading.name,
                cents: opts.reading.errorCents,
              },
            ]
          : []
  const snap = buildTunerExportSnapshot({
    a4Hz: opts.a4Hz,
    keyPc: opts.prefs.keyPc,
    keyGridTemperament: opts.prefs.keyGridTemperament,
    chordLockEnabled: opts.prefs.chordLockEnabled,
    chordNatureId: opts.prefs.chordNatureId,
    surface: surfaceLabel,
    rows,
    killGate: 'conditional',
  })
  const blob = new Blob([JSON.stringify(snap, null, 2) + '\n\n' + tunerExportToCsv(snap)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `singtags-tuner-${snap.exportedAt.slice(0, 19)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
