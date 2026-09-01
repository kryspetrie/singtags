/** Pause between countdown ticks (ms). */
export const OPTICAL_SEND_COUNTDOWN_STEP_MS = 1000

/** Seconds shown before streaming begins. */
export const OPTICAL_SEND_COUNTDOWN_SECONDS = [3, 2, 1] as const

/**
 * Show 3-2-1 before an optical send stream starts.
 * Returns false when cancelled via {@link abortOpticalSendCountdown}.
 */
export async function runOpticalSendCountdown(
  onTick: (value: number) => void,
  signal?: { cancelled: boolean },
): Promise<boolean> {
  for (const value of OPTICAL_SEND_COUNTDOWN_SECONDS) {
    if (signal?.cancelled) return false
    onTick(value)
    await new Promise((resolve) => setTimeout(resolve, OPTICAL_SEND_COUNTDOWN_STEP_MS))
  }
  return !signal?.cancelled
}

export function createOpticalSendCountdownSignal(): { cancelled: boolean; cancel(): void } {
  const signal = { cancelled: false }
  return {
    get cancelled() {
      return signal.cancelled
    },
    cancel() {
      signal.cancelled = true
    },
  }
}
