/**
 * Arrange audio preview -- pitch-pipe voice (same as Pitch Pipe / pay-the-key).
 */
import type { AudioPreview, StackPreview } from '../../../ports/AudioPreview'
import { createStackPlayer } from './stackPlayer'

export function createWebAudioPreview(): AudioPreview {
  const player = createStackPlayer()
  return {
    playStack(stack: StackPreview, durationMs?: number): Promise<void> {
      return player.playStack(stack, durationMs)
    },
    startStack(stack: StackPreview): Promise<void> {
      return player.startStack(stack)
    },
    stopStack(): void {
      player.stopStack(true)
    },
    dispose(): void {
      player.dispose()
    },
  }
}

export default createWebAudioPreview
