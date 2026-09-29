export type PreviewVoice = 'tenor' | 'lead' | 'bari' | 'bass'

export type StackPreview = {
  midi: Record<PreviewVoice, number>
  cents?: Partial<Record<PreviewVoice, number>>
}

/**
 * Port: audition a four-part stack (adapter = Web Audio / pitch-pipe voice).
 * `playStack` is timed; `startStack` / `stopStack` support hold-to-hear.
 */
export interface AudioPreview {
  playStack(stack: StackPreview, durationMs?: number): Promise<void>
  /** Sound on until {@link stopStack} (or dispose). */
  startStack(stack: StackPreview): Promise<void>
  stopStack(): void
  dispose(): void
}
