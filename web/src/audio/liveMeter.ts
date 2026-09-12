/**
 * Live mic metering for Labs Audio Recorder:
 * fixed-scale dBFS peaks (not display-normalized), sticky peak hold,
 * clip detection, and a scrolling column ring for waveform UI.
 */

export const LIVE_METER_FLOOR_DB = -60
export const LIVE_METER_CLIP_LINEAR = 0.99
/** Peak hold: stick briefly, then decay toward current. */
export const LIVE_METER_HOLD_MS = 700
export const LIVE_METER_HOLD_DECAY_DB_PER_SEC = 14
/** Warn when sticky peak stays below this while recording. */
export const LIVE_METER_LOW_DB = -24
/** Visible scrolling backlog (~12s at {@link LIVE_WAVEFORM_COLUMN_MS}). */
export const LIVE_WAVEFORM_COLUMNS = 240
/** One waveform column every N ms (slower = more backlog on screen). */
export const LIVE_WAVEFORM_COLUMN_MS = 50

export type LiveMeterColumn = {
  /** Peak linear amplitude 0–1+ for this column (fixed scale, not normalized). */
  peak: number
  clipped: boolean
}

export type LiveMeterSnapshot = {
  /** Instantaneous peak (linear 0–1+). */
  peak: number
  peakDb: number
  /** Sticky peak hold (dBFS). */
  holdDb: number
  holdLinear: number
  rms: number
  rmsDb: number
  /** True if this frame's peak hit clip threshold. */
  clipped: boolean
  /** Sticky hold is at/near 0 dBFS. */
  peaking: boolean
  /** Hold stays below low threshold. */
  tooLow: boolean
  columns: readonly LiveMeterColumn[]
}

export function linearToDb(linear: number, floorDb = LIVE_METER_FLOOR_DB): number {
  if (!Number.isFinite(linear) || linear <= 0) return floorDb
  const db = 20 * Math.log10(linear)
  return Math.max(floorDb, Math.min(6, db))
}

export function dbToLinear(db: number): number {
  if (!Number.isFinite(db) || db <= LIVE_METER_FLOOR_DB) return 0
  return Math.pow(10, db / 20)
}

/** Map dBFS in [floor, 0] to 0–1 meter fill (clamped). */
export function dbToMeterRatio(db: number, floorDb = LIVE_METER_FLOOR_DB): number {
  if (!Number.isFinite(db)) return 0
  const t = (db - floorDb) / (0 - floorDb)
  return Math.max(0, Math.min(1.05, t))
}

/**
 * Advance sticky peak hold.
 * Pure helper for tests; meter uses the same rules.
 */
export function advancePeakHold(opts: {
  holdLinear: number
  peakLinear: number
  holdMsRemaining: number
  dtMs: number
  holdMs?: number
  decayDbPerSec?: number
}): { holdLinear: number; holdMsRemaining: number } {
  const holdMs = opts.holdMs ?? LIVE_METER_HOLD_MS
  const decayDbPerSec = opts.decayDbPerSec ?? LIVE_METER_HOLD_DECAY_DB_PER_SEC
  if (opts.peakLinear >= opts.holdLinear) {
    return { holdLinear: opts.peakLinear, holdMsRemaining: holdMs }
  }
  let remaining = opts.holdMsRemaining - opts.dtMs
  if (remaining > 0) {
    return { holdLinear: opts.holdLinear, holdMsRemaining: remaining }
  }
  remaining = 0
  const holdDb = linearToDb(opts.holdLinear)
  const nextDb = holdDb - (decayDbPerSec * opts.dtMs) / 1000
  const nextLinear = Math.max(opts.peakLinear, dbToLinear(nextDb))
  return { holdLinear: nextLinear, holdMsRemaining: remaining }
}

export type LiveInputMeter = {
  /** Poll after start; safe during pause (frozen last values unless updatePaused). */
  getSnapshot: () => LiveMeterSnapshot
  /** Call once per animation frame while active. */
  tick: (paused?: boolean) => LiveMeterSnapshot
  dispose: () => void
}

/**
 * Create a live input meter on a MediaStream.
 * Uses float time-domain data so 0 dBFS maps to |sample| ≈ 1.
 */
export function createLiveInputMeter(
  stream: MediaStream,
  opts?: { columns?: number; columnMs?: number },
): LiveInputMeter {
  const columnCount = Math.max(32, opts?.columns ?? LIVE_WAVEFORM_COLUMNS)
  const columnMs = Math.max(16, opts?.columnMs ?? LIVE_WAVEFORM_COLUMN_MS)
  const columns: LiveMeterColumn[] = Array.from({ length: columnCount }, () => ({
    peak: 0,
    clipped: false,
  }))
  let write = 0
  let peak = 0
  let rms = 0
  let holdLinear = 0
  let holdMsRemaining = 0
  let lastTs = performance.now()
  let columnAccumMs = 0
  let columnPeak = 0
  let columnClipped = false
  let disposed = false

  let ctx: AudioContext | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let analyser: AnalyserNode | null = null
  let data: Float32Array<ArrayBuffer> | null = null

  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (AC) {
      ctx = new AC()
      source = ctx.createMediaStreamSource(stream)
      analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0
      source.connect(analyser)
      data = new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>
    }
  } catch {
    /* meter optional */
  }

  const snapshot = (): LiveMeterSnapshot => {
    const peakDb = linearToDb(peak)
    const holdDb = linearToDb(holdLinear)
    const ordered: LiveMeterColumn[] = new Array(columnCount)
    for (let i = 0; i < columnCount; i++) {
      ordered[i] = columns[(write + i) % columnCount]!
    }
    return {
      peak,
      peakDb,
      holdDb,
      holdLinear,
      rms,
      rmsDb: linearToDb(rms),
      clipped: peak >= LIVE_METER_CLIP_LINEAR,
      peaking: holdLinear >= LIVE_METER_CLIP_LINEAR,
      tooLow: holdLinear > 0 && holdDb < LIVE_METER_LOW_DB,
      columns: ordered,
    }
  }

  const tick = (paused = false): LiveMeterSnapshot => {
    if (disposed) return snapshot()
    const now = performance.now()
    const dtMs = Math.max(1, Math.min(100, now - lastTs))
    lastTs = now

    if (!paused && analyser && data) {
      analyser.getFloatTimeDomainData(data)
      let p = 0
      let sumSq = 0
      for (let i = 0; i < data.length; i++) {
        const v = data[i]!
        const a = Math.abs(v)
        if (a > p) p = a
        sumSq += v * v
      }
      peak = p
      rms = Math.sqrt(sumSq / data.length)
      const clipped = p >= LIVE_METER_CLIP_LINEAR
      columnPeak = Math.max(columnPeak, p)
      columnClipped = columnClipped || clipped
      columnAccumMs += dtMs
      while (columnAccumMs >= columnMs) {
        columns[write] = { peak: columnPeak, clipped: columnClipped }
        write = (write + 1) % columnCount
        columnAccumMs -= columnMs
        columnPeak = p
        columnClipped = clipped
      }
    } else if (analyser && data) {
      // Levels-only (monitor / pause): update VU peaks without scrolling the waveform.
      analyser.getFloatTimeDomainData(data)
      let p = 0
      let sumSq = 0
      for (let i = 0; i < data.length; i++) {
        const v = data[i]!
        const a = Math.abs(v)
        if (a > p) p = a
        sumSq += v * v
      }
      peak = p
      rms = Math.sqrt(sumSq / data.length)
    }

    const advanced = advancePeakHold({
      holdLinear,
      peakLinear: paused ? holdLinear : peak,
      holdMsRemaining,
      dtMs,
    })
    holdLinear = advanced.holdLinear
    holdMsRemaining = advanced.holdMsRemaining
    return snapshot()
  }

  return {
    getSnapshot: snapshot,
    tick,
    dispose: () => {
      disposed = true
      try {
        source?.disconnect()
      } catch {
        /* ignore */
      }
      try {
        void ctx?.close()
      } catch {
        /* ignore */
      }
      source = null
      analyser = null
      ctx = null
      data = null
    },
  }
}

/** @deprecated Prefer createLiveInputMeter; kept for simple 0–1 peak consumers. */
export function createInputLevelMeter(stream: MediaStream): {
  getLevel: () => number
  dispose: () => void
} {
  const meter = createLiveInputMeter(stream, { columns: 32 })
  let raf = 0
  let level = 0
  let disposed = false
  const loop = () => {
    if (disposed) return
    level = meter.tick(false).peak
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)
  return {
    getLevel: () => level,
    dispose: () => {
      disposed = true
      if (raf) cancelAnimationFrame(raf)
      meter.dispose()
    },
  }
}
