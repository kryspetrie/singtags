/**
 * Offline pitch/speed for downloads — same bake as playback (bakeClient).
 * @deprecated Import from bakeClient; kept as a thin re-export during migration.
 */
export { processOfflineTransform, preloadBakePipeline } from './bakeClient'

/** Sync path — dynamically loads DSP so this module does not eagerly pull WSOLA/formant. */
export async function processOfflineTransformSync(
  input: AudioBuffer,
  pitchSemitones: number,
  speed: number,
): Promise<AudioBuffer | null> {
  const { bakeAudioBufferSync } = await import('./voiceTransform')
  return bakeAudioBufferSync(input, pitchSemitones, speed)
}
