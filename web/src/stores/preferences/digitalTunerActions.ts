/** Digital Tuner preference actions (settings blob only). */

import { type Ref, watch } from 'vue'
import type { StoreDeps } from './deps'
import {
  defaultDigitalTunerPrefs,
  loadDigitalTunerPrefs,
  normalizeDigitalTunerPrefs,
  prefsForPitchRange,
  saveDigitalTunerPrefs,
  type DigitalTunerPrefs,
} from '../../lib/preferences/digitalTuner'

export function createDigitalTunerActions(deps: StoreDeps) {
  const digitalTunerPrefs = deps.digitalTunerPrefs as Ref<DigitalTunerPrefs>

  function setDigitalTunerPrefs(patch: Partial<DigitalTunerPrefs>): void {
    const merged: DigitalTunerPrefs = {
      ...digitalTunerPrefs.value,
      ...patch,
      schema: 'singtags.digitalTuner.v1',
    }
    // Keep analysis pitch band and Spec display band in lockstep.
    if (
      patch.pitchRangeId != null ||
      patch.pitchFMinHz != null ||
      patch.pitchFMaxHz != null
    ) {
      Object.assign(
        merged,
        prefsForPitchRange(
          patch.pitchRangeId ?? merged.pitchRangeId,
          merged.pitchFMinHz,
          merged.pitchFMaxHz,
        ),
      )
    } else if (patch.specFMinHz != null || patch.specFMaxHz != null) {
      Object.assign(
        merged,
        prefsForPitchRange('custom', merged.specFMinHz, merged.specFMaxHz),
      )
    }
    digitalTunerPrefs.value = normalizeDigitalTunerPrefs(merged)
  }

  function resetDigitalTunerPrefs(): void {
    digitalTunerPrefs.value = defaultDigitalTunerPrefs()
  }

  function hydrateDigitalTunerPrefs(): void {
    digitalTunerPrefs.value = loadDigitalTunerPrefs()
  }

  /**
   * Resolve concert A for analysis.
   * When prefs say `followPitchPipe`, join live Pitch Pipe A / detune — no cross-schema write.
   */
  function resolveTunerA4Hz(): number {
    const a = digitalTunerPrefs.value.a4Hz
    if (typeof a === 'number' && a > 0) return a
    // followPitchPipe: prefer explicit pitch-pipe aHz, else derive from detune cents.
    const pipeA = deps.pitchPipeAHz?.value
    if (typeof pipeA === 'number' && pipeA > 0) return pipeA
    const detuneFn = deps.globalPitchDetuneCents as (() => number) | undefined
    const detune = typeof detuneFn === 'function' ? detuneFn() : 0
    return 440 * 2 ** (detune / 1200)
  }

  const actions = {
    setDigitalTunerPrefs,
    resetDigitalTunerPrefs,
    hydrateDigitalTunerPrefs,
    resolveTunerA4Hz,
  }
  Object.assign(deps, actions)

  function bindWatches(): void {
    watch(
      digitalTunerPrefs,
      (v) => {
        saveDigitalTunerPrefs(v)
      },
      { deep: true, flush: 'sync' },
    )
  }

  return { actions, bindWatches }
}
