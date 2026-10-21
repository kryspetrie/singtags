/**
 * Shared Chord / Number label mode for Harmonize + Coach Choose buttons.
 */
import { computed, ref } from 'vue'
import {
  loadChordPickLabelMode,
  saveChordPickLabelMode,
  type ChordPickLabelMode,
} from '../lib/tagRoll/chordsPrefs'

const mode = ref<ChordPickLabelMode>(loadChordPickLabelMode('name'))

export function useChordPickLabelMode() {
  const chordLabelMode = computed(() => mode.value)

  function setChordLabelMode(next: ChordPickLabelMode): void {
    if (mode.value === next) return
    mode.value = next
    saveChordPickLabelMode(next)
  }

  return { chordLabelMode, setChordLabelMode }
}
