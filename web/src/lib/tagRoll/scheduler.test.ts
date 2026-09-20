import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTagRollScheduler } from './scheduler'
import { TAG_ROLL_PPQ } from './types'

function fakePlayer() {
  return {
    noteOn: vi.fn(async () => undefined),
    noteOff: vi.fn(),
  }
}

describe('createTagRollScheduler', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function installClock() {
    let now = 0
    let rafCb: FrameRequestCallback | null = null
    vi.stubGlobal('performance', { now: () => now })
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCb = cb
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {
      rafCb = null
    })
    return {
      setNow: (t: number) => {
        now = t
      },
      tick: () => {
        rafCb?.(now)
      },
      get now() {
        return now
      },
    }
  }

  it('advances playhead and ends at length', () => {
    const clock = installClock()
    const playheads: number[] = []
    let ended = false
    const sched = createTagRollScheduler({
      getNotes: () => [],
      getBpm: () => 120,
      getLengthTicks: () => TAG_ROLL_PPQ * 2,
      player: fakePlayer() as never,
      onPlayhead: (t) => playheads.push(t),
      onEnded: () => {
        ended = true
      },
    })

    sched.play(0)
    expect(sched.isPlaying()).toBe(true)
    // 120 BPM → 960 ticks/sec; 1s reaches length 960.
    clock.setNow(1000)
    clock.tick()
    expect(ended).toBe(true)
    expect(sched.isPlaying()).toBe(false)
    expect(playheads.at(-1)).toBe(TAG_ROLL_PPQ * 2)
    sched.dispose()
  })

  it('stops at the end of the last note before project length', () => {
    const clock = installClock()
    let ended = false
    const sched = createTagRollScheduler({
      getNotes: () => [
        {
          id: 'n1',
          partId: 'p',
          midi: 60,
          startTick: 0,
          durationTicks: TAG_ROLL_PPQ,
        },
      ],
      getBpm: () => 120,
      getLengthTicks: () => TAG_ROLL_PPQ * 16,
      player: fakePlayer() as never,
      onPlayhead: () => undefined,
      onEnded: () => {
        ended = true
      },
    })

    sched.play(0)
    // Last note ends at 480 ticks; 120 BPM → 960 ticks/sec → 0.5s.
    clock.setNow(500)
    clock.tick()
    expect(ended).toBe(true)
    expect(sched.isPlaying()).toBe(false)
    expect(sched.getPlayheadTick()).toBe(TAG_ROLL_PPQ)
    sched.dispose()
  })

  it('stop can reset playhead to zero', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
    const playheads: number[] = []
    const sched = createTagRollScheduler({
      getNotes: () => [],
      getBpm: () => 120,
      getLengthTicks: () => TAG_ROLL_PPQ * 4,
      player: fakePlayer() as never,
      onPlayhead: (t) => playheads.push(t),
    })
    sched.play(TAG_ROLL_PPQ)
    sched.stop({ resetPlayhead: true })
    expect(sched.getPlayheadTick()).toBe(0)
    expect(playheads.at(-1)).toBe(0)
  })

  it('holds after the note finishes, then gaps — no mid-note chop/resume', () => {
    const clock = installClock()
    const player = fakePlayer()
    const holdTicks = TAG_ROLL_PPQ // 1 beat at 120bpm = 0.5s
    const gapTicks = TAG_ROLL_PPQ / 2 // 0.25s
    const noteDur = TAG_ROLL_PPQ // 0.5s written
    const sched = createTagRollScheduler({
      getNotes: () => [
        {
          id: 'n1',
          partId: 'p',
          midi: 60,
          startTick: 0,
          durationTicks: noteDur,
        },
      ],
      getBpm: () => 120,
      getExpressions: () => [
        {
          id: 'f0',
          kind: 'fermata',
          tick: 0,
          holdTicks,
          gapTicks,
        },
      ],
      getLengthTicks: () => TAG_ROLL_PPQ * 8,
      player: player as never,
      onPlayhead: () => undefined,
    })

    sched.play(0)
    // Fermata waits until the note ends — not an immediate hold at onset.
    expect(sched.getPlayheadTick()).toBe(0)
    expect(player.noteOn).toHaveBeenCalled()
    expect(player.noteOn.mock.calls.length).toBe(1)

    // Mid-note: still advancing, still one attack
    clock.setNow(200)
    clock.tick()
    expect(sched.getPlayheadTick()).toBeGreaterThan(0)
    expect(sched.getPlayheadTick()).toBeLessThan(noteDur)
    expect(player.noteOff).not.toHaveBeenCalled()

    // At written end (~500ms): enter hold, sustain (no noteOff yet)
    clock.setNow(520)
    clock.tick()
    expect(Math.floor(sched.getPlayheadTick())).toBe(noteDur)
    expect(player.noteOff).not.toHaveBeenCalled()

    // After hold (0.5s written + 0.5s hold ≈ 1000ms): gap silences
    clock.setNow(1100)
    clock.tick()
    expect(player.noteOff).toHaveBeenCalled()

    // After gap: continue past the note — do not re-attack the same note
    const offs = player.noteOff.mock.calls.length
    const ons = player.noteOn.mock.calls.length
    clock.setNow(1400)
    clock.tick()
    expect(sched.getPlayheadTick()).toBeGreaterThan(noteDur)
    expect(player.noteOn.mock.calls.length).toBe(ons)
    expect(player.noteOff.mock.calls.length).toBeGreaterThanOrEqual(offs)

    sched.dispose()
  })

  it('does not re-attack a finished fermata note across the gap', () => {
    const clock = installClock()
    const player = fakePlayer()
    const sched = createTagRollScheduler({
      getNotes: () => [
        {
          id: 'n1',
          partId: 'p',
          midi: 60,
          startTick: 0,
          durationTicks: TAG_ROLL_PPQ,
        },
      ],
      getBpm: () => 120,
      getExpressions: () => [
        {
          id: 'f1',
          kind: 'fermata',
          tick: 0,
          holdTicks: TAG_ROLL_PPQ / 4,
          gapTicks: TAG_ROLL_PPQ / 4,
        },
      ],
      getLengthTicks: () => TAG_ROLL_PPQ * 8,
      player: player as never,
      onPlayhead: () => undefined,
    })

    sched.play(0)
    clock.setNow(50)
    clock.tick()
    clock.setNow(600) // past written end + hold
    clock.tick()
    clock.setNow(800) // past gap
    clock.tick()
    clock.setNow(900)
    clock.tick()
    // Single attack for the fermata note — never resume-chop it
    expect(player.noteOn.mock.calls.length).toBe(1)
    sched.dispose()
  })

  it('advances slower during a rit than at constant start tempo', () => {
    const clock = installClock()
    const rit = [
      {
        id: 'r1',
        kind: 'rit' as const,
        startTick: 0,
        endTick: TAG_ROLL_PPQ * 16,
        startBpm: 120,
        endBpm: 40,
      },
    ]
    const sched = createTagRollScheduler({
      getNotes: () => [],
      getBpm: () => 120,
      getTempoMarkers: () => [{ id: 't0', tick: 0, bpm: 120 }],
      getExpressions: () => rit,
      getLengthTicks: () => TAG_ROLL_PPQ * 64,
      player: fakePlayer() as never,
      onPlayhead: () => undefined,
    })

    sched.play(0)
    // Multiple frames so playhead enters the slowing region (not just t=0 rate).
    for (let t = 100; t <= 1000; t += 100) {
      clock.setNow(t)
      clock.tick()
    }
    const withRit = sched.getPlayheadTick()
    sched.dispose()

    const clock2 = installClock()
    const sched2 = createTagRollScheduler({
      getNotes: () => [],
      getBpm: () => 120,
      getTempoMarkers: () => [{ id: 't0', tick: 0, bpm: 120 }],
      getExpressions: () => [],
      getLengthTicks: () => TAG_ROLL_PPQ * 64,
      player: fakePlayer() as never,
      onPlayhead: () => undefined,
    })
    sched2.play(0)
    for (let t = 100; t <= 1000; t += 100) {
      clock2.setNow(t)
      clock2.tick()
    }
    const constant = sched2.getPlayheadTick()
    sched2.dispose()

    expect(withRit).toBeLessThan(constant)
  })

  it('skips only fermatas strictly before fromTick', () => {
    const clock = installClock()
    const player = fakePlayer()
    const sched = createTagRollScheduler({
      getNotes: () => [],
      getBpm: () => 120,
      getExpressions: () => [
        { id: 'f0', kind: 'fermata', tick: 0, holdTicks: TAG_ROLL_PPQ, gapTicks: 0 },
        { id: 'f1', kind: 'fermata', tick: TAG_ROLL_PPQ, holdTicks: TAG_ROLL_PPQ, gapTicks: 0 },
      ],
      getLengthTicks: () => TAG_ROLL_PPQ * 8,
      player: player as never,
      onPlayhead: () => undefined,
    })

    sched.play(TAG_ROLL_PPQ)
    expect(Math.floor(sched.getPlayheadTick())).toBe(TAG_ROLL_PPQ)
    clock.setNow(10)
    clock.tick()
    expect(Math.floor(sched.getPlayheadTick())).toBe(TAG_ROLL_PPQ)
    sched.dispose()
  })

  it('lookahead arms upcoming notes before they are due', () => {
    const clock = installClock()
    const player = fakePlayer()
    const sched = createTagRollScheduler({
      getNotes: () => [
        {
          id: 'n1',
          partId: 'p',
          midi: 60,
          startTick: TAG_ROLL_PPQ,
          durationTicks: TAG_ROLL_PPQ,
        },
      ],
      getBpm: () => 120,
      getLengthTicks: () => TAG_ROLL_PPQ * 8,
      player: player as never,
      onPlayhead: () => undefined,
    })
    sched.play(0)
    clock.setNow(400)
    clock.tick()
    expect(player.noteOn).not.toHaveBeenCalled()
    clock.setNow(450)
    clock.tick()
    expect(player.noteOn).toHaveBeenCalled()
    sched.dispose()
  })

  it('skips muted parts and applies pan/gain opts', () => {
    const clock = installClock()
    const player = fakePlayer()
    const sched = createTagRollScheduler({
      getNotes: () => [
        {
          id: 'lead',
          partId: 'lead',
          midi: 60,
          startTick: 0,
          durationTicks: TAG_ROLL_PPQ * 2,
        },
        {
          id: 'bass',
          partId: 'bass',
          midi: 48,
          startTick: 0,
          durationTicks: TAG_ROLL_PPQ * 2,
        },
      ],
      getBpm: () => 120,
      getLengthTicks: () => TAG_ROLL_PPQ * 8,
      getMix: () => [
        { partId: 'lead', volume: 1, pan: -0.2, mute: false, solo: false },
        { partId: 'bass', volume: 0.5, pan: 0.2, mute: true, solo: false },
      ],
      player: player as never,
      onPlayhead: () => undefined,
    })
    sched.play(0)
    clock.setNow(20)
    clock.tick()
    expect(player.noteOn).toHaveBeenCalledTimes(1)
    expect(player.noteOn.mock.calls[0]![0]).toBe('C4')
    expect(player.noteOn.mock.calls[0]![2]).toMatchObject({
      voiceKey: 'part:lead',
      gain: 1,
      pan: -0.2,
    })
    sched.dispose()
  })

  it('glides on same-part overlap instead of a second attack', () => {
    const clock = installClock()
    const player = {
      noteOn: vi.fn(async () => undefined),
      noteOff: vi.fn(),
      glideTo: vi.fn(),
    }
    const sched = createTagRollScheduler({
      getNotes: () => [
        {
          id: 'a',
          partId: 'p',
          midi: 60,
          startTick: 0,
          durationTicks: TAG_ROLL_PPQ * 2,
        },
        {
          id: 'b',
          partId: 'p',
          midi: 64,
          startTick: TAG_ROLL_PPQ,
          durationTicks: TAG_ROLL_PPQ * 2,
        },
      ],
      getBpm: () => 120,
      getLengthTicks: () => TAG_ROLL_PPQ * 8,
      player: player as never,
      onPlayhead: () => undefined,
    })

    sched.play(0)
    clock.setNow(10)
    clock.tick()
    expect(player.noteOn).toHaveBeenCalledTimes(1)
    clock.setNow(520)
    clock.tick()
    expect(player.glideTo).toHaveBeenCalled()
    expect(player.noteOn.mock.calls.length).toBe(1)
    sched.dispose()
  })

  it('applies phrase decay when a note ends into silence, legato decay when abutting', () => {
    const clock = installClock()
    const player = fakePlayer()
    const sched = createTagRollScheduler({
      getNotes: () => [
        {
          id: 'a',
          partId: 'p',
          midi: 60,
          startTick: 0,
          durationTicks: TAG_ROLL_PPQ,
        },
        {
          id: 'b',
          partId: 'p',
          midi: 64,
          startTick: TAG_ROLL_PPQ,
          durationTicks: TAG_ROLL_PPQ,
        },
        {
          id: 'c',
          partId: 'p',
          midi: 67,
          startTick: TAG_ROLL_PPQ * 3,
          durationTicks: TAG_ROLL_PPQ,
        },
      ],
      getBpm: () => 120,
      getLengthTicks: () => TAG_ROLL_PPQ * 16,
      getSoundEnvelope: () => ({
        attackSec: 0.05,
        decaySec: 0.08,
        phraseDecaySec: 0.55,
      }),
      player: player as never,
      onPlayhead: () => undefined,
    })

    sched.play(0)
    clock.setNow(10)
    clock.tick()
    expect(player.noteOn).toHaveBeenCalled()

    // Past a→b abut: legato (primary) decay.
    clock.setNow(520)
    clock.tick()
    const legatoOff = player.noteOff.mock.calls.find((c) => c[1] === 0.08)
    expect(legatoOff).toBeTruthy()

    // Past b into gap before c: phrase decay.
    clock.setNow(1020)
    clock.tick()
    const phraseOff = player.noteOff.mock.calls.find((c) => c[1] === 0.55)
    expect(phraseOff).toBeTruthy()
    sched.dispose()
  })
})
