/**
 * Day-range helpers for Labs Audio Recorder list filtering + timeline scrub.
 */
import { sessionLocalDateKey, type RecorderSession } from '../types/recorder'

const DAY_MS = 86_400_000
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export type SessionDayBounds = { min: string; max: string }

export type SessionDayMark = { day: string; count: number }

/** Parse YYYY-MM-DD as a local-calendar UTC noon stamp (stable day math). */
export function parseDayKey(day: string): number | null {
  const m = DAY_RE.exec(day.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const t = Date.UTC(y, mo - 1, d, 12, 0, 0)
  return Number.isFinite(t) ? t : null
}

/** Format a UTC-noon day stamp back to YYYY-MM-DD. */
export function formatDayKey(utcNoonMs: number): string {
  const d = new Date(utcNoonMs)
  const y = d.getUTCFullYear()
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0')
  const day = d.getUTCDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Inclusive day count between two YYYY-MM-DD keys (same day → 1). */
export function daySpanInclusive(min: string, max: string): number {
  const a = parseDayKey(min)
  const b = parseDayKey(max)
  if (a == null || b == null) return 0
  return Math.floor((b - a) / DAY_MS) + 1
}

/** Offset a day key by ±n calendar days. */
export function shiftDayKey(day: string, deltaDays: number): string {
  const t = parseDayKey(day)
  if (t == null) return day
  return formatDayKey(t + deltaDays * DAY_MS)
}

/** Clamp day into [min, max] (lexicographic YYYY-MM-DD). */
export function clampDayKey(day: string, min: string, max: string): string {
  if (!day) return min
  if (day < min) return min
  if (day > max) return max
  return day
}

/**
 * Keep From ≤ To after one side changes.
 * When `which` is `from` and from > to, raise to; when `to` and to < from, lower from.
 */
export function clampDateRangePair(
  from: string,
  to: string,
  which: 'from' | 'to',
): { from: string; to: string } {
  const f = from.trim()
  const t = to.trim()
  if (!f || !t) return { from: f, to: t }
  if (which === 'from' && f > t) return { from: f, to: f }
  if (which === 'to' && t < f) return { from: t, to: t }
  return { from: f, to: t }
}

/** Oldest → newest local session days, or null when none have a valid day. */
export function sessionDayBounds(
  sessions: readonly RecorderSession[],
): SessionDayBounds | null {
  let min = ''
  let max = ''
  for (const s of sessions) {
    const key = sessionLocalDateKey(s.createdAt)
    if (!key) continue
    if (!min || key < min) min = key
    if (!max || key > max) max = key
  }
  return min && max ? { min, max } : null
}

/** Distinct session days with counts, sorted ascending. */
export function sessionDayHistogram(
  sessions: readonly RecorderSession[],
): SessionDayMark[] {
  const counts = new Map<string, number>()
  for (const s of sessions) {
    const key = sessionLocalDateKey(s.createdAt)
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, count]) => ({ day, count }))
}

/**
 * Map a day to [0, 1] along [min, max]. Single-day span → 0.5.
 * Out-of-range days clamp to 0 / 1.
 */
export function dayToFraction(day: string, min: string, max: string): number {
  const span = daySpanInclusive(min, max)
  if (span <= 1) return 0.5
  const a = parseDayKey(min)
  const b = parseDayKey(max)
  const d = parseDayKey(day)
  if (a == null || b == null || d == null) return 0
  const clamped = Math.min(b, Math.max(a, d))
  return (clamped - a) / (b - a)
}

/** Inverse of {@link dayToFraction}: fraction → nearest day in [min, max]. */
export function fractionToDay(fraction: number, min: string, max: string): string {
  const span = daySpanInclusive(min, max)
  if (span <= 1) return min
  const a = parseDayKey(min)
  const b = parseDayKey(max)
  if (a == null || b == null) return min
  const t = Math.min(1, Math.max(0, fraction))
  const ms = a + Math.round(t * (b - a) / DAY_MS) * DAY_MS
  return formatDayKey(ms)
}

/** Short label for the Dates button, e.g. "Sep 1 – Sep 14". */
export function formatDateRangeButtonLabel(from: string, to: string): string {
  const f = from.trim()
  const t = to.trim()
  if (!f && !t) return 'Dates'
  if (f && t && f === t) return `Dates: ${formatShortDay(f)}`
  if (f && t) return `Dates: ${formatShortDay(f)} – ${formatShortDay(t)}`
  if (f) return `Dates: from ${formatShortDay(f)}`
  return `Dates: to ${formatShortDay(t)}`
}

/** Compact month-day label for scrub ends / button. */
export function formatShortDay(day: string): string {
  const ms = parseDayKey(day)
  if (ms == null) return day
  const d = new Date(ms)
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ] as const
  return `${months[d.getUTCMonth()] ?? 'Jan'} ${d.getUTCDate()}`
}
