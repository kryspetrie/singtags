/**
 * Lookahead sequencer for Tag Roll playback.
 */
import { midiToNote } from '../../audio/pianoSamples'
import type { PitchTonePlayer } from '../../audio/pitchTone'
import type { TagRollNote } from './types'
import { TAG_ROLL_PPQ } from './types'

export type TagRollScheduler = {
  play(fromTick: number): void
  pause(): void
  stop(opts?: { resetPlayhead?: boolean }): void
  isPlaying(): boolean
  getPlayheadTick(): number
  dispose(): void
}

export function createTagRollScheduler(opts: {
  getNotes: () => readonly TagRollNote[]
  getBpm: () => number
  getLengthTicks: () => number
  player: PitchTonePlayer
  onPlayhead: (tick: number) => void
  onEnded?: () => void
}): TagRollScheduler {
  let playing = false
  let raf = 0
  let startPerf = 0
  let startTick = 0
  let playhead = 0
  const scheduled = new Set<string>()
  const active = new Map<string, string>() // noteId -> scientific note

  function ticksPerSecond(): number {
    return (opts.getBpm() / 60) * TAG_ROLL_PPQ
  }

  function tickNow(): number {
    if (!playing) return playhead
    const elapsed = (performance.now() - startPerf) / 1000
    return startTick + elapsed * ticksPerSecond()
  }

  function releaseAll(): void {
    for (const note of active.values()) opts.player.noteOff(note, true)
    active.clear()
    scheduled.clear()
  }

  function frame(): void {
    if (!playing) return
    const t = tickNow()
    playhead = t
    opts.onPlayhead(Math.floor(t))

    const length = opts.getLengthTicks()
    if (t >= length) {
      playing = false
      releaseAll()
      playhead = length
      opts.onPlayhead(length)
      opts.onEnded?.()
      return
    }

    const lookAhead = t + ticksPerSecond() * 0.08
    for (const n of opts.getNotes()) {
      const end = n.startTick + n.durationTicks
      if (end <= t) {
        if (active.has(n.id)) {
          const nn = active.get(n.id)!
          opts.player.noteOff(nn, true)
          active.delete(n.id)
        }
        continue
      }
      if (n.startTick <= lookAhead && n.startTick >= startTick - 1 && !scheduled.has(n.id)) {
        if (n.startTick <= t + 2 || n.startTick <= lookAhead) {
          scheduled.add(n.id)
          const nn = midiToNote(n.midi)
          void opts.player.noteOn(nn).then(() => {
            if (playing) active.set(n.id, nn)
          })
        }
      }
      if (active.has(n.id) && t >= end) {
        const nn = active.get(n.id)!
        opts.player.noteOff(nn, true)
        active.delete(n.id)
      }
    }

    raf = requestAnimationFrame(frame)
  }

  return {
    play(fromTick: number) {
      releaseAll()
      playing = true
      startTick = Math.max(0, fromTick)
      playhead = startTick
      startPerf = performance.now()
      opts.onPlayhead(Math.floor(playhead))
      raf = requestAnimationFrame(frame)
    },
    pause() {
      if (!playing) return
      playing = false
      cancelAnimationFrame(raf)
      playhead = tickNow()
      releaseAll()
      opts.onPlayhead(Math.floor(playhead))
    },
    stop(o) {
      playing = false
      cancelAnimationFrame(raf)
      releaseAll()
      if (o?.resetPlayhead) playhead = 0
      opts.onPlayhead(Math.floor(playhead))
    },
    isPlaying: () => playing,
    getPlayheadTick: () => (playing ? tickNow() : playhead),
    dispose() {
      playing = false
      cancelAnimationFrame(raf)
      releaseAll()
    },
  }
}
