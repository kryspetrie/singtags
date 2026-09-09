/** Pause between countdown ticks (ms). */
export const OPTICAL_SEND_COUNTDOWN_STEP_MS = 1000

/** Seconds shown before streaming begins. */
export const OPTICAL_SEND_COUNTDOWN_SECONDS = [3, 2, 1] as const

export type OpticalSendCountdownTick = number | 'paused'

export type OpticalSendCountdownSignal = {
  readonly cancelled: boolean
  readonly paused: boolean
  cancel(): void
  /** Pause; or if already paused, clear pause so the countdown restarts from 3. */
  togglePause(): void
}

/**
 * Wait up to `ms`, ending early if the signal is cancelled or paused.
 * Uses a single timeout + poll so fake timers can advance cleanly.
 */
function waitWhile(
  signal: OpticalSendCountdownSignal | undefined,
  ms: number,
): Promise<'ok' | 'cancelled' | 'paused'> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: 'ok' | 'cancelled' | 'paused') => {
      if (settled) return
      settled = true
      clearInterval(poll)
      clearTimeout(done)
      resolve(result)
    }
    const poll = setInterval(() => {
      if (signal?.cancelled) finish('cancelled')
      else if (signal?.paused) finish('paused')
    }, 25)
    const done = setTimeout(() => {
      if (signal?.cancelled) finish('cancelled')
      else if (signal?.paused) finish('paused')
      else finish('ok')
    }, ms)
  })
}

/**
 * Show 3-2-1 before an optical send stream starts.
 * Click-to-pause via {@link OpticalSendCountdownSignal.togglePause}: while paused the
 * tick is `'paused'`; toggling again restarts from 3.
 * Returns false when cancelled via {@link OpticalSendCountdownSignal.cancel}.
 */
export async function runOpticalSendCountdown(
  onTick: (value: OpticalSendCountdownTick) => void,
  signal?: OpticalSendCountdownSignal,
): Promise<boolean> {
  outer: while (true) {
    if (signal?.cancelled) return false

    while (signal?.paused) {
      onTick('paused')
      const wait = await waitWhile(signal, 250)
      if (wait === 'cancelled') return false
      if (!signal.paused) continue outer
    }

    for (const value of OPTICAL_SEND_COUNTDOWN_SECONDS) {
      if (signal?.cancelled) return false
      if (signal?.paused) {
        onTick('paused')
        while (signal.paused) {
          const wait = await waitWhile(signal, 250)
          if (wait === 'cancelled') return false
        }
        continue outer
      }

      onTick(value)
      const step = await waitWhile(signal, OPTICAL_SEND_COUNTDOWN_STEP_MS)
      if (step === 'cancelled') return false
      if (step === 'paused') {
        onTick('paused')
        while (signal?.paused) {
          const wait = await waitWhile(signal, 250)
          if (wait === 'cancelled') return false
        }
        continue outer
      }
    }

    return !signal?.cancelled
  }
}

export function createOpticalSendCountdownSignal(): OpticalSendCountdownSignal {
  const state = { cancelled: false, paused: false }
  return {
    get cancelled() {
      return state.cancelled
    },
    get paused() {
      return state.paused
    },
    cancel() {
      state.cancelled = true
      state.paused = false
    },
    togglePause() {
      if (state.cancelled) return
      state.paused = !state.paused
    },
  }
}
