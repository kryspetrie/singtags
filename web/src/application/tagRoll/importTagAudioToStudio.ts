/**
 * Import a catalog tag’s learning-track stems into a new Tag Studio project
 * via browser pitch extraction (YIN on solo channels).
 */
import { decodeAudioDataExclusive } from '../../audio/decodeLock'
import { createInteractiveAudioContext } from '../../audio/interactiveAudioContext'
import { soloSideForPart, type PartSide } from '../../lib/audioLayout'
import { playableAudioParts, ultraAudioPath, playbackAudioPath } from '../../lib/audioTiers'
import { mediaUrl } from '../../lib/mediaUrl'
import { buildTagRollProjectFromPitchStacks } from '../../lib/tagRoll/pitchExtract/buildProject'
import {
  segmentPitchStacks,
  VOICE_PARTS,
  type PartSeries,
  type VoicePart,
} from '../../lib/tagRoll/pitchExtract/segmentStacks'
import { parseTonalityFromKey } from '../../lib/tagRoll/pitchExtract/tonality'
import {
  PITCH_EXTRACT_SR,
  resampleLinear,
  trackMidiSeries,
} from '../../lib/tagRoll/pitchExtract/yin'
import { parseTagRollProjectJson } from '../../lib/tagRoll/projectJson'
import type { TagRollProject } from '../../lib/tagRoll/types'
import { resolveAudioPart } from '../../offline/resolveMedia'
import type { TagDetail } from '../../types/tag'
import { putNewTagRoll } from './persist'
import type { TagRollRepository } from '../../ports/TagRollRepository'
import type { Clock } from '../../ports/Clock'

export type ImportTagAudioProgress = {
  phase: 'resolve' | 'decode' | 'pitch' | 'build' | 'save'
  part?: VoicePart
  index: number
  total: number
  message: string
}

export type ImportTagAudioResult =
  | { ok: true; project: TagRollProject; stackCount: number }
  | { ok: false; error: string }

function monoFromBuffer(buf: AudioBuffer, soloSide: PartSide | null): Float32Array {
  const n = buf.length
  if (buf.numberOfChannels < 2) {
    const c = buf.getChannelData(0)
    return c.slice(0)
  }
  const L = buf.getChannelData(0)
  const R = buf.getChannelData(1)
  if (soloSide === 'right') return R.slice(0)
  if (soloSide === 'left') return L.slice(0)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = (L[i]! + R[i]!) * 0.5
  return out
}

async function fetchPartBytes(
  detail: TagDetail,
  part: VoicePart,
  offlineOnly: boolean,
): Promise<{ bytes: ArrayBuffer; via: string }> {
  // Prefer ultra solo (already mono + align-baked) when published.
  const ultra = ultraAudioPath(detail, part)
  if (ultra && !offlineOnly) {
    try {
      const res = await fetch(mediaUrl(ultra))
      if (res.ok) return { bytes: await res.arrayBuffer(), via: 'ultra_solo' }
    } catch {
      /* fall through */
    }
  }

  const resolved = await resolveAudioPart(detail, part, { offlineOnly })
  if (resolved?.url) {
    const res = await fetch(resolved.url)
    if (res.ok) return { bytes: await res.arrayBuffer(), via: resolved.tier || 'resolved' }
  }

  const playback = playbackAudioPath(detail, part)
  if (playback && !offlineOnly) {
    const res = await fetch(mediaUrl(playback))
    if (res.ok) return { bytes: await res.arrayBuffer(), via: 'playback' }
  }

  throw new Error(`No audio for ${part}`)
}

/** True when the tag has precomputed pitch JSON or four voice learning tracks. */
export function tagCanImportAudioToStudio(
  detail: TagDetail,
  ctx: 'online' | 'offline' = 'online',
): boolean {
  if (detail.pitch_studio) return true
  const parts = new Set(playableAudioParts(detail, ctx).map((p) => p.toLowerCase()))
  if (ctx === 'online') return VOICE_PARTS.every((p) => parts.has(p))
  const online = new Set(playableAudioParts(detail, 'online').map((p) => p.toLowerCase()))
  return VOICE_PARTS.every((p) => online.has(p) || parts.has(p))
}

async function importPrecomputedStudio(
  detail: TagDetail,
  repository: TagRollRepository,
  clock: Clock,
  onProgress?: (p: ImportTagAudioProgress) => void,
): Promise<ImportTagAudioResult | null> {
  const path = detail.pitch_studio
  if (!path) return null
  onProgress?.({
    phase: 'resolve',
    index: 0,
    total: 1,
    message: 'Loading precomputed pitch project…',
  })
  try {
    const res = await fetch(mediaUrl(path), { cache: 'no-cache' })
    if (!res.ok) return null
    const raw = (await res.json()) as unknown
    const parsed = parseTagRollProjectJson(raw, { now: clock.now() })
    if (!parsed.ok) return null
    onProgress?.({
      phase: 'save',
      index: 1,
      total: 1,
      message: 'Saving project…',
    })
    const saved = await putNewTagRoll(repository, parsed.project, clock)
    const stackCount = detail.pitch_extract?.stack_count ?? parsed.project.harmonySketch.length
    return { ok: true, project: saved, stackCount: Number(stackCount) || 0 }
  } catch {
    return null
  }
}

/**
 * Prefer precomputed ``pitch_studio.json``; fall back to live YIN on stems.
 */
export async function importTagAudioToStudio(
  detail: TagDetail,
  repository: TagRollRepository,
  clock: Clock,
  opts?: {
    offlineOnly?: boolean
    onProgress?: (p: ImportTagAudioProgress) => void
    /** When true, skip precomputed JSON and always run live extract. */
    forceLive?: boolean
  },
): Promise<ImportTagAudioResult> {
  const report = opts?.onProgress
  if (!opts?.forceLive) {
    const pre = await importPrecomputedStudio(detail, repository, clock, report)
    if (pre) return pre
  }

  if (!VOICE_PARTS.every((p) =>
    playableAudioParts(detail, 'online').map((x) => x.toLowerCase()).includes(p),
  )) {
    return {
      ok: false,
      error: detail.pitch_studio
        ? 'Precomputed pitch file missing from media; tag also lacks four voice tracks.'
        : 'This tag needs Lead, Tenor, Bari, and Bass learning tracks (or a precomputed pitch_studio.json).',
    }
  }

  const offlineOnly = opts?.offlineOnly === true
  const ctx = createInteractiveAudioContext()
  try {
    if (ctx.state === 'suspended') await ctx.resume()
  } catch {
    /* ignore */
  }

  const series = {} as PartSeries
  const total = VOICE_PARTS.length

  try {
    for (let i = 0; i < VOICE_PARTS.length; i++) {
      const part = VOICE_PARTS[i]!
      report?.({
        phase: 'resolve',
        part,
        index: i,
        total,
        message: `Loading ${part}…`,
      })
      const { bytes, via } = await fetchPartBytes(detail, part, offlineOnly)
      report?.({
        phase: 'decode',
        part,
        index: i,
        total,
        message: `Decoding ${part} (${via})…`,
      })
      const buf = await decodeAudioDataExclusive(bytes.slice(0))
      const soloSide =
        via === 'ultra_solo'
          ? null
          : soloSideForPart(part, detail.audio_layouts, detail.audio_layout_summary)
      const mono = monoFromBuffer(buf, soloSide)
      const atExtractSr = resampleLinear(mono, buf.sampleRate, PITCH_EXTRACT_SR)
      report?.({
        phase: 'pitch',
        part,
        index: i,
        total,
        message: `Tracking pitch on ${part}…`,
      })
      await new Promise((r) => setTimeout(r, 0))
      series[part] = trackMidiSeries(atExtractSr, PITCH_EXTRACT_SR)
    }

    report?.({
      phase: 'build',
      index: total,
      total,
      message: 'Building Tag Studio project…',
    })
    const { tonality, mode, preferFlats } = parseTonalityFromKey(detail.writ_key, detail.key)
    const stacks = segmentPitchStacks(series, tonality)
    if (!stacks.length) {
      return {
        ok: false,
        error: 'Could not detect enough simultaneous pitches. Try after caching tracks.',
      }
    }

    const project = buildTagRollProjectFromPitchStacks({
      title: detail.title?.trim()
        ? `${detail.title.trim()} (pitch)`
        : `Tag ${detail.tag_id} (pitch)`,
      arranger: detail.arranger ?? '',
      tagId: detail.tag_id,
      tonality,
      mode,
      preferFlats,
      stacks,
    })

    report?.({
      phase: 'save',
      index: total,
      total,
      message: 'Saving project…',
    })
    const saved = await putNewTagRoll(repository, project, clock)
    return { ok: true, project: saved, stackCount: stacks.length }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Pitch import failed',
    }
  }
}
