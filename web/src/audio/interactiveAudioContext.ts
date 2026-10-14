/**
 * Lowest-latency AudioContext for live keys (pitch pipe / sample piano).
 *
 * `latencyHint: 0` asks Chrome (and others that accept a number) for the
 * smallest output buffer. String `'interactive'` alone is often still 20–40ms+.
 */
export function createInteractiveAudioContext(): AudioContext {
  try {
    return new AudioContext({ latencyHint: 0 })
  } catch {
    return new AudioContext({ latencyHint: 'interactive' })
  }
}

export type AudioKeepalive = {
  osc: OscillatorNode
  gain: GainNode
}

/**
 * Silent running source so the audio render quantum stays hot after unlock.
 * Cold-start after resume often adds a noticeable first-hit delay.
 */
export function ensureAudioKeepalive(
  ctx: AudioContext,
  existing: AudioKeepalive | null,
): AudioKeepalive {
  if (existing) return existing
  const gain = ctx.createGain()
  gain.gain.value = 0
  const osc = ctx.createOscillator()
  osc.frequency.value = 40
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  return { osc, gain }
}

export function stopAudioKeepalive(ka: AudioKeepalive | null): void {
  if (!ka) return
  try {
    ka.osc.stop()
    ka.osc.disconnect()
    ka.gain.disconnect()
  } catch {
    /* already stopped */
  }
}
