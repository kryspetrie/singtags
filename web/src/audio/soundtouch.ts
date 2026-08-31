/**
 * Offline pitch/speed for downloads — same bake pipeline as {@link bakeClient}.
 * @deprecated Import from bakeClient; kept as a thin re-export during migration.
 */
export { processOfflineTransform, preloadBakePipeline } from './bakeClient'

/**
 * Dynamically import sync DSP (no worker) for tests and degraded environments.
 */
export async function processOfflineTransformSync(
  input: AudioBuffer,
  pitchSemitones: number,
  speed: number,
): Promise<AudioBuffer | null> {
  const { bakeAudioBufferSync } = await import('./voiceTransform')
  return bakeAudioBufferSync(input, pitchSemitones, speed)
}
