/**
 * Minimal oscillator playback with per-voice detune (for JI audition).
 * SingTags uses a richer pitchTone stack — swap/port on merge.
 */

function midiToHz(midi: number, cents = 0): number {
  return 440 * 2 ** ((midi - 69 + cents / 100) / 12)
}

export type StackVoice = 'tenor' | 'lead' | 'bari' | 'bass'

export type StackPlayback = {
  midi: Record<StackVoice, number>
  cents?: Partial<Record<StackVoice, number>>
}

export function createStackPlayer() {
  let ctx: AudioContext | null = null
  const nodes = new Map<string, { osc: OscillatorNode; gain: GainNode }>()

  function ensure(): AudioContext {
    if (!ctx) ctx = new AudioContext()
    return ctx
  }

  async function playStack(stack: StackPlayback, durationMs = 900): Promise<void> {
    const ac = ensure()
    if (ac.state === 'suspended') await ac.resume()
    const t0 = ac.currentTime
    const voices: StackVoice[] = ['bass', 'bari', 'lead', 'tenor']
    for (const v of voices) {
      const midi = stack.midi[v]
      const cents = stack.cents?.[v] ?? 0
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = 'sine'
      osc.frequency.value = midiToHz(midi, cents)
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000)
      osc.connect(gain)
      gain.connect(ac.destination)
      osc.start(t0)
      osc.stop(t0 + durationMs / 1000 + 0.05)
      const id = `${v}-${midi}-${t0}`
      nodes.set(id, { osc, gain })
      osc.onended = () => nodes.delete(id)
    }
  }

  function dispose(): void {
    for (const { osc } of nodes.values()) {
      try {
        osc.stop()
      } catch {
        /* already stopped */
      }
    }
    nodes.clear()
    void ctx?.close()
    ctx = null
  }

  return { playStack, dispose }
}
