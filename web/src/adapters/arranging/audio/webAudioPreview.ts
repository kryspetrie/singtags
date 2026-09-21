import type { AudioPreview, StackPreview } from '../../../ports/AudioPreview'
import { createStackPlayer } from './stackPlayer'

export function createWebAudioPreview(): AudioPreview {
  const player = createStackPlayer()
  return {
    playStack(stack: StackPreview, durationMs?: number) {
      return player.playStack(stack, durationMs)
    },
    dispose() {
      player.dispose()
    },
  }
}
