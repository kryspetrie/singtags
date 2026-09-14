/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_QUICK_RECORD,
  DEFAULT_RECORDER_CAPTURE,
  defaultRecorderSessionName,
  filterRecorderSessions,
  normalizeQuickRecordPrefs,
  normalizeRecorderCapture,
  normalizeRecorderSession,
  parseSessionLabels,
} from '../types/recorder'
import {
  clampDateRangePair,
  clampDayKey,
  daySpanInclusive,
  dayToFraction,
  formatDateRangeButtonLabel,
  fractionToDay,
  sessionDayBounds,
  sessionDayHistogram,
  shiftDayKey,
} from '../lib/recorderDateRange'
import { pickSupportedRecorderMime } from '../audio/recorderCapture'
import { cropAudioBufferToWav } from '../audio/cropAudioBuffer'
import { resetSharedAudioContextForTests } from './channelSolo'

describe('recorder types', () => {
  it('normalizes capture prefs', () => {
    expect(normalizeRecorderCapture({})).toEqual(DEFAULT_RECORDER_CAPTURE)
    expect(normalizeRecorderCapture({ channels: 2, bitRate: 96_000 }).channels).toBe(2)
    expect(normalizeRecorderCapture({ bitRate: 999_999 }).bitRate).toBe(320_000)
  })

  it('parses labels', () => {
    expect(parseSessionLabels('a, b; c\nd')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('builds an ASCII default session name', () => {
    const name = defaultRecorderSessionName(new Date(2026, 8, 11, 13, 22, 0))
    expect(name).toBe('Sep 11, 2026 - 1:22 PM')
    expect(name).not.toMatch(/[^\x20-\x7E]/)
  })

  it('normalizes session linked tag and notes', () => {
    const s = normalizeRecorderSession({
      id: 'rs_1',
      name: '  ',
      notes: 'warmup',
      labels: ['x'],
      linkedTag: { tagId: 42, title: 'Hello' },
      linkedLibrary: null,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
      takeIds: ['rt_1'],
      capture: DEFAULT_RECORDER_CAPTURE,
    })
    expect(s.name).toBe('Untitled session')
    expect(s.notes).toBe('warmup')
    expect(s.linkedTag).toEqual({ tagId: 42, title: 'Hello' })
    expect(s.linkedLibrary).toBeNull()
  })

  it('filters by query, date range, and sort', () => {
    const sessions = [
      normalizeRecorderSession({
        id: 'a',
        name: 'Lead run',
        notes: 'slow tempo',
        labels: ['warmup'],
        linkedTag: null,
        linkedLibrary: null,
        createdAt: '2026-09-10T15:00:00.000Z',
        updatedAt: '2026-09-10T15:00:00.000Z',
        takeIds: [],
        capture: DEFAULT_RECORDER_CAPTURE,
      }),
      normalizeRecorderSession({
        id: 'b',
        name: 'Bass pass',
        notes: '',
        labels: [],
        linkedTag: null,
        linkedLibrary: null,
        createdAt: '2026-09-11T15:00:00.000Z',
        updatedAt: '2026-09-11T15:00:00.000Z',
        takeIds: [],
        capture: DEFAULT_RECORDER_CAPTURE,
      }),
    ]
    expect(filterRecorderSessions(sessions, { query: 'tempo' }).map((s) => s.id)).toEqual(['a'])
    expect(filterRecorderSessions(sessions, { query: 'bass' }).map((s) => s.id)).toEqual(['b'])
    expect(filterRecorderSessions(sessions, { query: 'warmup' }).map((s) => s.id)).toEqual(['a'])
    expect(filterRecorderSessions(sessions, { sort: 'newest' })[0]!.id).toBe('b')
    expect(filterRecorderSessions(sessions, { sort: 'oldest' })[0]!.id).toBe('a')
  })

  it('defaults capture processing to music (raw)', () => {
    expect(normalizeRecorderCapture({}).processing).toBe('music')
    expect(normalizeRecorderCapture({ processing: 'voice' }).processing).toBe('voice')
  })

  it('normalizes quick record prefs', () => {
    expect(normalizeQuickRecordPrefs({})).toEqual(DEFAULT_QUICK_RECORD)
    expect(
      normalizeQuickRecordPrefs({ autoLabels: [' lead ', '', 'warmup'], autoNotes: 'hi' }),
    ).toEqual({ autoLabels: ['lead', 'warmup'], autoNotes: 'hi' })
  })
})

describe('recorderDateRange', () => {
  function session(id: string, createdAt: string) {
    return normalizeRecorderSession({
      id,
      name: id,
      notes: '',
      labels: [],
      linkedTag: null,
      linkedLibrary: null,
      createdAt,
      updatedAt: createdAt,
      takeIds: [],
      capture: DEFAULT_RECORDER_CAPTURE,
    })
  }

  it('computes bounds and histogram', () => {
    const sessions = [
      session('a', '2026-09-10T15:00:00.000Z'),
      session('b', '2026-09-11T15:00:00.000Z'),
      session('c', '2026-09-10T18:00:00.000Z'),
    ]
    const bounds = sessionDayBounds(sessions)
    expect(bounds).not.toBeNull()
    expect(bounds!.min <= bounds!.max).toBe(true)
    const hist = sessionDayHistogram(sessions)
    expect(hist.reduce((n, m) => n + m.count, 0)).toBe(3)
    expect(hist.every((m) => m.count >= 1)).toBe(true)
  })

  it('returns null bounds for empty list', () => {
    expect(sessionDayBounds([])).toBeNull()
    expect(sessionDayHistogram([])).toEqual([])
  })

  it('clamps day keys and range pairs', () => {
    expect(clampDayKey('2026-09-05', '2026-09-01', '2026-09-10')).toBe('2026-09-05')
    expect(clampDayKey('2026-08-01', '2026-09-01', '2026-09-10')).toBe('2026-09-01')
    expect(clampDayKey('2026-10-01', '2026-09-01', '2026-09-10')).toBe('2026-09-10')
    expect(clampDateRangePair('2026-09-12', '2026-09-10', 'from')).toEqual({
      from: '2026-09-12',
      to: '2026-09-12',
    })
    expect(clampDateRangePair('2026-09-12', '2026-09-10', 'to')).toEqual({
      from: '2026-09-10',
      to: '2026-09-10',
    })
  })

  it('maps fractions and shifts days', () => {
    expect(daySpanInclusive('2026-09-01', '2026-09-01')).toBe(1)
    expect(daySpanInclusive('2026-09-01', '2026-09-03')).toBe(3)
    expect(dayToFraction('2026-09-01', '2026-09-01', '2026-09-03')).toBe(0)
    expect(dayToFraction('2026-09-03', '2026-09-01', '2026-09-03')).toBe(1)
    expect(fractionToDay(0, '2026-09-01', '2026-09-03')).toBe('2026-09-01')
    expect(fractionToDay(1, '2026-09-01', '2026-09-03')).toBe('2026-09-03')
    expect(shiftDayKey('2026-09-01', 1)).toBe('2026-09-02')
    expect(shiftDayKey('2026-09-01', -1)).toBe('2026-08-31')
  })

  it('formats Dates button labels', () => {
    expect(formatDateRangeButtonLabel('', '')).toBe('Dates')
    expect(formatDateRangeButtonLabel('2026-09-01', '2026-09-14')).toMatch(/^Dates: /)
    expect(formatDateRangeButtonLabel('2026-09-01', '2026-09-01')).toMatch(/^Dates: /)
  })
})

describe('recorderCapture mime pick', () => {
  it('falls back when MediaRecorder missing', () => {
    const orig = globalThis.MediaRecorder
    // @ts-expect-error test delete
    delete globalThis.MediaRecorder
    expect(pickSupportedRecorderMime('audio/webm;codecs=opus')).toContain('audio/')
    globalThis.MediaRecorder = orig
  })

  it('prefers supported mime', () => {
    vi.stubGlobal(
      'MediaRecorder',
      class {
        static isTypeSupported(m: string) {
          return m === 'audio/webm'
        }
      },
    )
    expect(pickSupportedRecorderMime('audio/mp4')).toBe('audio/webm')
    vi.unstubAllGlobals()
  })
})

describe('cropAudioBufferToWav', () => {
  beforeEach(() => {
    resetSharedAudioContextForTests()
  })

  it('slices to the requested region and returns wav bytes', () => {
    const sr = 100
    const left = new Float32Array(100)
    for (let i = 0; i < 100; i++) left[i] = i / 100
    const outData = new Float32Array(20)
    const outBuf = {
      numberOfChannels: 1,
      length: 20,
      sampleRate: sr,
      getChannelData: () => outData,
    }
    vi.stubGlobal(
      'AudioContext',
      class {
        createBuffer() {
          return outBuf
        }
      },
    )
    const buf = {
      numberOfChannels: 1,
      length: 100,
      sampleRate: sr,
      duration: 1,
      getChannelData: () => left,
    } as unknown as AudioBuffer

    const result = cropAudioBufferToWav(buf, 0.1, 0.3)
    expect(result.durationSec).toBeCloseTo(0.2, 5)
    expect(result.sampleRate).toBe(100)
    expect(result.channels).toBe(1)
    expect(result.bytes.byteLength).toBeGreaterThan(44)
    expect(outData[0]).toBeCloseTo(0.1, 5)
    expect(outData[19]).toBeCloseTo(0.29, 5)
    vi.unstubAllGlobals()
  })
})
