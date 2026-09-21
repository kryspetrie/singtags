/**
 * Lookahead sequencer for Tag Roll playback with tempo map + fermatas.
 * Each part is strictly monophonic; same-part overlaps glide (ease-in-out portamento).
 */
import { midiToNote } from '../../audio/pianoSamples'
import type { PitchTonePlayer } from '../../audio/pitchTone'
import { playbackEndTick } from './notesAtTick'
import {
  bpmAtTick,
  fermataExecutionTick,
  notesSpanningTick,
  shouldSkipFermataOnPlay,
  ticksToSecondsAtBpm,
} from './tempoMap'
import { isPartAudible, mixForPart } from './mix'
import {
  findOverlappingPredecessor,
  overlapWindow,
  partVoiceKey,
  shouldDecayOnNoteEnd,
} from './portamento'
import {
  releaseSecForNoteEnd,
  TAG_ROLL_DEFAULT_SOUND_ENVELOPE,
  type TagRollSoundEnvelope,
} from './soundEnvelope'
import { TAG_ROLL_DEFAULT_SWING, swingScoreTickRate, swingUnitTicks } from './swingMap'
import type {
  TagRollExpression,
  TagRollNote,
  TagRollPartMix,
  TagRollSwing,
  TagRollTempoMarker,
  TagRollTimeSignature,
} from './types'
import { TAG_ROLL_DEFAULT_BPM, TAG_ROLL_DEFAULT_TIME_SIGNATURE, TAG_ROLL_PPQ } from './types'
import { beatsCrossed, subdivisionsCrossed } from './metronomeBeats'

export type TagRollScheduler = {
  play(fromTick: number, opts?: { metronomePrime?: boolean }): void
  pause(): void
  stop(opts?: { resetPlayhead?: boolean }): void
  isPlaying(): boolean
  getPlayheadTick(): number
  dispose(): void
}

type FermataPhase = {
  /** Score tick where hold/gap run (note end, or mark if empty). */
  tick: number
  holdUntil: number
  gapUntil: number
  stage: 'hold' | 'gap'
}

export function createTagRollScheduler(opts: {
  getNotes: () => readonly TagRollNote[]
  getBpm: () => number
  getTempoMarkers?: () => readonly TagRollTempoMarker[]
  getExpressions?: () => readonly TagRollExpression[]
  getLengthTicks: () => number
  getMix?: () => readonly TagRollPartMix[]
  getSoundEnvelope?: () => TagRollSoundEnvelope
  getTimeSignature?: () => TagRollTimeSignature
  getSwing?: () => TagRollSwing
  /** When true with swing, click swing-unit subdivisions instead of beats only. */
  getMetronomeSwing?: () => boolean
  /** When true, fire {@link onMetronomeBeat} for each crossed beat. */
  getMetronomeEnabled?: () => boolean
  onMetronomeBeat?: (hit: { tick: number; downbeat: boolean }) => void
  player: PitchTonePlayer
  onPlayhead: (tick: number) => void
  onEnded?: () => void
}): TagRollScheduler {
  let playing = false
  let raf = 0
  let lastPerf = 0
  let playhead = 0
  let fermata: FermataPhase | null = null
  const passedFermatas = new Set<string>()
  const scheduled = new Set<string>()
  /** noteId -> voiceKey */
  const active = new Map<string, string>()
  /** partId -> currently owned noteId (monophonic). */
  const activeByPart = new Map<string, string>()

  function markers(): readonly TagRollTempoMarker[] {
    return opts.getTempoMarkers?.() ?? [{ id: 'legacy', tick: 0, bpm: opts.getBpm() }]
  }

  function expressions(): readonly TagRollExpression[] {
    return opts.getExpressions?.() ?? []
  }

  function swing(): TagRollSwing {
    return opts.getSwing?.() ?? TAG_ROLL_DEFAULT_SWING
  }

  function currentBpm(): number {
    return bpmAtTick(
      playhead,
      markers(),
      expressions(),
      opts.getBpm() || TAG_ROLL_DEFAULT_BPM,
    )
  }

  function mixRows(): readonly TagRollPartMix[] {
    return opts.getMix?.() ?? []
  }

  function envelope(): TagRollSoundEnvelope {
    return opts.getSoundEnvelope?.() ?? TAG_ROLL_DEFAULT_SOUND_ENVELOPE
  }

  function timeSignature(): TagRollTimeSignature {
    return opts.getTimeSignature?.() ?? TAG_ROLL_DEFAULT_TIME_SIGNATURE
  }

  function fireMetronome(fromTick: number, toTick: number, optsPrime?: { includeStart?: boolean }): void {
    if (!opts.getMetronomeEnabled?.() || !opts.onMetronomeBeat) return
    const ts = timeSignature()
    const sw = swing()
    const useSwingSubs =
      !!opts.getMetronomeSwing?.() && sw.enabled && sw.amount > 0
    const from = optsPrime?.includeStart ? fromTick - 0.75 : fromTick
    const hits = useSwingSubs
      ? subdivisionsCrossed(from, toTick, swingUnitTicks(sw.unit, ts), ts)
      : beatsCrossed(from, toTick, ts)
    for (const h of hits) opts.onMetronomeBeat({ tick: h.tick, downbeat: h.downbeat })
  }

  function phraseRelease(): number {
    return envelope().phraseDecaySec
  }

  function releaseAll(): void {
    const rel = phraseRelease()
    for (const key of new Set(active.values())) opts.player.noteOff(key, rel)
    active.clear()
    activeByPart.clear()
    scheduled.clear()
  }

  function silenceActive(): void {
    // Fermata gap — phrase-end decay, not an abrupt cut.
    const rel = phraseRelease()
    for (const key of new Set(active.values())) opts.player.noteOff(key, rel)
    active.clear()
    activeByPart.clear()
  }

  function overlapSeconds(startTick: number, endTick: number): number {
    const bpm = Math.max(1, currentBpm())
    return ticksToSecondsAtBpm(Math.max(0, endTick - startTick), bpm)
  }

  function startNote(n: TagRollNote): void {
    if (scheduled.has(n.id)) return
    const mix = mixRows()
    if (mix.length && !isPartAudible(n.partId, mix)) {
      scheduled.add(n.id)
      return
    }
    scheduled.add(n.id)

    const voiceKey = partVoiceKey(n.partId)
    const { volume, pan } = mixForPart(n.partId, mix)
    const notes = opts.getNotes()
    const pred = findOverlappingPredecessor(notes, n)
    const win = pred ? overlapWindow(pred, n) : null

    if (fermata?.stage === 'gap') return

    if (pred && win && opts.player.glideTo && activeByPart.get(n.partId) === pred.id) {
      const dur = overlapSeconds(win.startTick, win.endTick)
      opts.player.glideTo(voiceKey, midiToNote(n.midi), dur)
      active.delete(pred.id)
      active.set(n.id, voiceKey)
      activeByPart.set(n.partId, n.id)
      return
    }

    // Fresh attack (or steal previous non-overlapping voice on this part).
    const prevId = activeByPart.get(n.partId)
    if (prevId && prevId !== n.id) {
      // Next note is starting — use legato (primary) decay into the new attack.
      opts.player.noteOff(voiceKey, envelope().decaySec)
      active.delete(prevId)
      activeByPart.delete(n.partId)
    }

    active.set(n.id, voiceKey)
    activeByPart.set(n.partId, n.id)
    void opts.player.noteOn(midiToNote(n.midi), 0, { voiceKey, gain: volume, pan })
  }

  function endNoteIfOwned(n: TagRollNote): void {
    if (!active.has(n.id)) return
    // Only release if this note still owns the part voice.
    if (activeByPart.get(n.partId) !== n.id) {
      active.delete(n.id)
      return
    }
    const key = active.get(n.id)!
    const phraseEnd = shouldDecayOnNoteEnd(opts.getNotes(), n)
    opts.player.noteOff(key, releaseSecForNoteEnd(envelope(), phraseEnd))
    active.delete(n.id)
    activeByPart.delete(n.partId)
  }

  function scheduleNotes(t: number, lookAhead: number): void {
    const notes = [...opts.getNotes()].sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id))
    for (const n of notes) {
      const end = n.startTick + n.durationTicks
      if (end <= t) {
        // Keep sounding through a fermata hold that begins at this note’s end.
        if (fermata?.stage !== 'hold') endNoteIfOwned(n)
        continue
      }
      if (n.startTick <= lookAhead) {
        startNote(n)
      }
      if (active.has(n.id) && t >= end && fermata?.stage !== 'hold') {
        endNoteIfOwned(n)
      }
    }
  }

  function resumeAfterFermataGap(tick: number): void {
    // Re-attack only notes that still span past the execution point — not the
    // notes that just finished and were held through the fermata.
    for (const n of notesSpanningTick(opts.getNotes(), tick)) {
      scheduled.delete(n.id)
      startNote(n as TagRollNote)
    }
  }

  function beginFermata(
    e: Extract<TagRollExpression, { kind: 'fermata' }>,
    now: number,
    executionTick: number,
  ): void {
    const bpm = Math.max(1, currentBpm())
    const holdSec = ticksToSecondsAtBpm(e.holdTicks, bpm)
    const gapSec = ticksToSecondsAtBpm(e.gapTicks, bpm)
    fermata = {
      tick: executionTick,
      holdUntil: now + holdSec * 1000,
      gapUntil: now + (holdSec + gapSec) * 1000,
      stage: 'hold',
    }
    passedFermatas.add(e.id)
    playhead = executionTick
  }

  function frame(now: number): void {
    if (!playing) return
    const dt = Math.max(0, (now - lastPerf) / 1000)
    lastPerf = now

    if (fermata) {
      if (fermata.stage === 'hold') {
        playhead = fermata.tick
        opts.onPlayhead(Math.floor(playhead))
        scheduleNotes(playhead, playhead)
        if (now >= fermata.holdUntil) {
          fermata.stage = 'gap'
          silenceActive()
        }
      } else {
        playhead = fermata.tick
        opts.onPlayhead(Math.floor(playhead))
        if (now >= fermata.gapUntil) {
          const resumeTick = fermata.tick
          fermata = null
          playhead = Math.min(opts.getLengthTicks(), resumeTick + 0.75)
          resumeAfterFermataGap(playhead)
        }
      }
      raf = requestAnimationFrame(frame)
      return
    }

    const prev = playhead
    const bpm = currentBpm()
    // Sub-step so steep rit/accel curves track more accurately than one Euler step.
    const steps = Math.max(1, Math.min(8, Math.ceil(dt * 120)))
    const stepDt = dt / steps
    for (let i = 0; i < steps; i++) {
      const stepBpm = i === 0 ? bpm : currentBpm()
      const rate = swingScoreTickRate(playhead, swing(), timeSignature())
      playhead += stepDt * (stepBpm / 60) * TAG_ROLL_PPQ * rate
    }
    const next = playhead
    const notes = opts.getNotes()

    for (const e of expressions()) {
      if (e.kind !== 'fermata' || passedFermatas.has(e.id)) continue
      const at = fermataExecutionTick(e.tick, notes)
      if (at >= prev - 0.5 && at <= next + 0.5) {
        beginFermata(e, now, at)
        opts.onPlayhead(Math.floor(playhead))
        scheduleNotes(playhead, playhead)
        raf = requestAnimationFrame(frame)
        return
      }
    }

    playhead = next
    opts.onPlayhead(Math.floor(playhead))
    fireMetronome(prev, next)

    const endAt = playbackEndTick(opts.getNotes(), opts.getLengthTicks())
    if (playhead >= endAt) {
      playing = false
      releaseAll()
      playhead = endAt
      opts.onPlayhead(Math.floor(endAt))
      opts.onEnded?.()
      return
    }

    const lookAhead = playhead + (bpm / 60) * TAG_ROLL_PPQ * 0.08
    scheduleNotes(playhead, lookAhead)
    raf = requestAnimationFrame(frame)
  }

  return {
    play(fromTick: number, playOpts?: { metronomePrime?: boolean }) {
      releaseAll()
      playing = true
      playhead = Math.max(0, fromTick)
      lastPerf = performance.now()
      fermata = null
      passedFermatas.clear()
      const notes = opts.getNotes()
      for (const e of expressions()) {
        if (e.kind !== 'fermata') continue
        const at = fermataExecutionTick(e.tick, notes)
        if (shouldSkipFermataOnPlay(at, playhead)) {
          passedFermatas.add(e.id)
        }
      }
      opts.onPlayhead(Math.floor(playhead))
      if (playOpts?.metronomePrime !== false) {
        fireMetronome(playhead, playhead, { includeStart: true })
      }
      for (const e of expressions()) {
        if (e.kind !== 'fermata' || passedFermatas.has(e.id)) continue
        const at = fermataExecutionTick(e.tick, notes)
        if (Math.abs(at - playhead) <= 0.5) {
          beginFermata(e, lastPerf, at)
          break
        }
      }
      scheduleNotes(playhead, playhead)
      raf = requestAnimationFrame(frame)
    },
    pause() {
      if (!playing) return
      playing = false
      cancelAnimationFrame(raf)
      fermata = null
      releaseAll()
      opts.onPlayhead(Math.floor(playhead))
    },
    stop(o) {
      playing = false
      cancelAnimationFrame(raf)
      fermata = null
      releaseAll()
      if (o?.resetPlayhead) playhead = 0
      opts.onPlayhead(Math.floor(playhead))
    },
    isPlaying: () => playing,
    getPlayheadTick: () => playhead,
    dispose() {
      playing = false
      cancelAnimationFrame(raf)
      fermata = null
      releaseAll()
    },
  }
}
