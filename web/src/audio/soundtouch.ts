/**
 * Lazy SoundTouch worklet helpers.
 * Processor is never loaded on first paint — only when pitch or speed diverges from identity.
 */

export type SoundTouchNodeLike = {
  connect: (dest: AudioNode) => AudioNode
  disconnect: () => void
  pitch: { value: number }
  pitchSemitones: { value: number }
  playbackRate: { value: number }
}

/** Registration is per AudioContext — a process-wide flag causes InvalidStateError. */
const registeredContexts = new WeakSet<BaseAudioContext>()
const registerPromises = new WeakMap<BaseAudioContext, Promise<boolean>>()

let processorUrlPromise: Promise<string> | null = null

function loadProcessorUrl(): Promise<string> {
  if (!processorUrlPromise) {
    processorUrlPromise = import('@soundtouchjs/audio-worklet/processor?url').then(
      (m) => m.default as string,
    )
  }
  return processorUrlPromise
}

export async function ensureSoundTouchRegistered(ctx: BaseAudioContext): Promise<boolean> {
  if (registeredContexts.has(ctx)) return true
  const existing = registerPromises.get(ctx)
  if (existing) return existing

  const pending = (async () => {
    try {
      const [{ SoundTouchNode }, processorUrl] = await Promise.all([
        import('@soundtouchjs/audio-worklet'),
        loadProcessorUrl(),
      ])
      await SoundTouchNode.register(ctx, processorUrl)
      registeredContexts.add(ctx)
      return true
    } catch {
      return false
    } finally {
      registerPromises.delete(ctx)
    }
  })()
  registerPromises.set(ctx, pending)
  return pending
}

export async function createSoundTouchNode(ctx: AudioContext): Promise<SoundTouchNodeLike | null> {
  try {
    const ok = await ensureSoundTouchRegistered(ctx)
    if (!ok) return null
    const { SoundTouchNode } = await import('@soundtouchjs/audio-worklet')
    return new SoundTouchNode({ context: ctx }) as unknown as SoundTouchNodeLike
  } catch {
    return null
  }
}

export async function processOfflineTransform(
  input: AudioBuffer,
  pitchSemitones: number,
  speed: number,
): Promise<AudioBuffer | null> {
  try {
    const [{ processOffline }, processorUrl] = await Promise.all([
      import('@soundtouchjs/audio-worklet'),
      loadProcessorUrl(),
    ])
    return await processOffline({
      input,
      processorUrl,
      pitchSemitones,
      playbackRate: speed,
    })
  } catch {
    return null
  }
}
