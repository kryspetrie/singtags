export type PreviewVoice = 'tenor' | 'lead' | 'bari' | 'bass'

export type StackPreview = {
  midi: Record<PreviewVoice, number>
  cents?: Partial<Record<PreviewVoice, number>>
}

/** Port: audition a four-part stack (adapter = Web Audio). */
export interface AudioPreview {
  playStack(stack: StackPreview, durationMs?: number): Promise<void>
  dispose(): void
}
