/** Pitch pipe preference actions. */

import { type StoreDeps } from './deps'

import { watch } from 'vue'

import {
  aHzToCents,
  normalizePitchPipeGridScale,
  normalizePitchPipePianoDefaultOctave,
  type PitchPipeAHz,
  type PitchPipeLayout,
  type PitchPipeRange,
} from '../../audio/pitchUiLabels'

import {
  clearActivePitchPipeVoice,
  isPitchPipeSoundId,
  normalizePitchPipeAttackSec,
  type PitchPipeSoundId,
} from '../../audio/pitchPipeVoice'

import {
  isPianoSoundEngineId,
  type PianoSoundEngineId,
} from '../../audio/pianoSamples'

import {
  APPLY_DETUNE_GLOBAL_KEY,
  clampDetuneCents,
  loadPitchPipePrefs,
  savePitchPipePrefs,
} from './storage'

export function createPitchPipeActions(deps: StoreDeps) {

  const applyDetuneGlobally = deps.applyDetuneGlobally
  const pitchPipeAHz = deps.pitchPipeAHz
  const pitchPipeAttackSec = deps.pitchPipeAttackSec
  const pitchPipeDetuneCents = deps.pitchPipeDetuneCents
  const pitchPipeGridScale = deps.pitchPipeGridScale
  const pitchPipeLayout = deps.pitchPipeLayout
  const pitchPipePianoDefaultOctave = deps.pitchPipePianoDefaultOctave
  const pitchPipePianoEngine = deps.pitchPipePianoEngine
  const pitchPipePianoLockPosition = deps.pitchPipePianoLockPosition
  const pitchPipeRange = deps.pitchPipeRange
  const pitchPipeShowFullKeyboard = deps.pitchPipeShowFullKeyboard
  const pitchPipeShowOctave = deps.pitchPipeShowOctave
  const pitchPipeShowPcKeyRange = deps.pitchPipeShowPcKeyRange
  const pitchPipeSound = deps.pitchPipeSound

  /** Write current pitch-pipe refs to localStorage. Side effect: `savePitchPipePrefs`. */
  function persistPitchPipe(): void {
    savePitchPipePrefs({
      range: pitchPipeRange.value,
      layout: pitchPipeLayout.value,
      aHz: pitchPipeAHz.value,
      detuneCents: clampDetuneCents(pitchPipeDetuneCents.value),
      showOctave: pitchPipeShowOctave.value,
      sound: pitchPipeSound.value,
      gridScale: pitchPipeGridScale.value,
      showFullKeyboard: pitchPipeShowFullKeyboard.value,
      pianoDefaultOctave: pitchPipePianoDefaultOctave.value,
      pianoEngine: pitchPipePianoEngine.value,
      pianoLockPosition: pitchPipePianoLockPosition.value,
      showPcKeyRange: pitchPipeShowPcKeyRange.value,
      attackSec: normalizePitchPipeAttackSec(pitchPipeAttackSec.value),
    })
  }

  /** Set pitch-pipe note range. Side effect: localStorage via pitch-pipe watcher. */
  function setPitchPipeRange(range: PitchPipeRange): void {
    pitchPipeRange.value = range
  }

  /** Set pitch-pipe layout (grid, list, piano, piano-h). Side effect: localStorage. */
  function setPitchPipeLayout(layout: PitchPipeLayout): void {
    pitchPipeLayout.value = layout
  }

  /** Show octave digits on note labels (E4 vs E). Side effect: localStorage. */
  function setPitchPipeShowOctave(on: boolean): void {
    pitchPipeShowOctave.value = on
  }

  /** Set grid layout key size (70–250%, step 5). Side effect: localStorage. */
  function setPitchPipeGridScale(percent: number): void {
    pitchPipeGridScale.value = normalizePitchPipeGridScale(percent)
  }

  /** Nudge grid key size by ±5% (or a multiple of the step). */
  function nudgePitchPipeGridScale(delta: number): void {
    const steps = Math.round(delta / 5) || Math.sign(delta)
    setPitchPipeGridScale(pitchPipeGridScale.value + steps * 5)
  }

  /** Piano: show scrollable 66-key keyboard. Side effect: localStorage. */
  function setPitchPipeShowFullKeyboard(on: boolean): void {
    pitchPipeShowFullKeyboard.value = on
  }

  /** Horizontal piano: which C–C octave to open on. Side effect: localStorage. */
  function setPitchPipePianoDefaultOctave(octave: unknown): void {
    pitchPipePianoDefaultOctave.value = normalizePitchPipePianoDefaultOctave(octave)
  }

  /** Piano layouts / sheet dock: synth vs acoustic samples. Side effect: localStorage. */
  function setPitchPipePianoEngine(engine: PianoSoundEngineId): void {
    if (!isPianoSoundEngineId(engine)) return
    pitchPipePianoEngine.value = engine
  }

  /** Horizontal piano / sheet dock: lock scroll position. Side effect: localStorage. */
  function setPitchPipePianoLockPosition(on: boolean): void {
    pitchPipePianoLockPosition.value = on
  }

  /** Dim keys outside the computer-keyboard window. Side effect: localStorage. */
  function setPitchPipeShowPcKeyRange(on: boolean): void {
    pitchPipeShowPcKeyRange.value = on
  }

  function setPitchPipeAttackSec(sec: number): void {
    pitchPipeAttackSec.value = normalizePitchPipeAttackSec(sec)
  }

  /**
   * Built-in pitch sound (Mellow / Bright). Persists in pitch-pipe prefs and
   * clears any lab custom voice override so the selected built-in applies.
   */
  function setPitchPipeSound(sound: PitchPipeSoundId): void {
    if (!isPitchPipeSoundId(sound)) return
    pitchPipeSound.value = sound
    clearActivePitchPipeVoice()
  }

  /** Set concert-A preset highlight (may be null when detune is custom). */
  function setPitchPipeAHz(hz: PitchPipeAHz | null): void {
    pitchPipeAHz.value = hz
  }

  /** Absolute cents vs A440. Clears concert A when off-preset (pass `clearConcertA`). */
  function setPitchPipeDetuneCents(cents: number, opts?: { clearConcertA?: boolean }): void {
    pitchPipeDetuneCents.value = clampDetuneCents(cents)
    if (opts?.clearConcertA) pitchPipeAHz.value = null
  }

  /** Apply a concert A preset and snap detune to that pitch. */
  function setPitchPipeConcertA(hz: PitchPipeAHz): void {
    pitchPipeAHz.value = hz
    pitchPipeDetuneCents.value = clampDetuneCents(aHzToCents(hz))
  }

  /** Reload pitch-pipe prefs from storage (e.g. after offline cache restore). */
  function hydratePitchPipePrefs(): void {
    const p = loadPitchPipePrefs()
    pitchPipeRange.value = p.range
    pitchPipeLayout.value = p.layout
    pitchPipeAHz.value = p.aHz
    pitchPipeDetuneCents.value = p.detuneCents
    pitchPipeShowOctave.value = p.showOctave
    pitchPipeSound.value = p.sound
    pitchPipeGridScale.value = p.gridScale
    pitchPipeShowFullKeyboard.value = p.showFullKeyboard
    pitchPipePianoDefaultOctave.value = p.pianoDefaultOctave
    pitchPipePianoEngine.value = p.pianoEngine
    pitchPipePianoLockPosition.value = p.pianoLockPosition
    pitchPipeShowPcKeyRange.value = p.showPcKeyRange
    pitchPipeAttackSec.value = p.attackSec
  }

  /** Absolute cents to add to tag pay-the-key when global tuning is enabled. */
  function globalPitchDetuneCents(): number {
    return applyDetuneGlobally.value ? clampDetuneCents(pitchPipeDetuneCents.value) : 0
  }

  /** Toggle whether pitch-pipe tuning applies app-wide. */
  function setApplyDetuneGlobally(on: boolean): void {
    applyDetuneGlobally.value = on
  }

  const actions = {
    persistPitchPipe,
    setPitchPipeRange,
    setPitchPipeLayout,
    setPitchPipeShowOctave,
    setPitchPipeGridScale,
    nudgePitchPipeGridScale,
    setPitchPipeShowFullKeyboard,
    setPitchPipePianoDefaultOctave,
    setPitchPipePianoEngine,
    setPitchPipePianoLockPosition,
    setPitchPipeShowPcKeyRange,
    setPitchPipeAttackSec,
    setPitchPipeSound,
    setPitchPipeAHz,
    setPitchPipeDetuneCents,
    setPitchPipeConcertA,
    hydratePitchPipePrefs,
    globalPitchDetuneCents,
    setApplyDetuneGlobally,
  }
  Object.assign(deps, actions)

  function bindWatches(): void {

    watch(
      [
        pitchPipeRange,
        pitchPipeLayout,
        pitchPipeAHz,
        pitchPipeDetuneCents,
        pitchPipeShowOctave,
        pitchPipeSound,
        pitchPipeGridScale,
        pitchPipeShowFullKeyboard,
        pitchPipePianoDefaultOctave,
        pitchPipePianoEngine,
        pitchPipePianoLockPosition,
        pitchPipeShowPcKeyRange,
        pitchPipeAttackSec,
      ],
      () => persistPitchPipe(),
      { flush: 'sync' },
    )

    watch(
      applyDetuneGlobally,
      (v) => {
        try {
          localStorage.setItem(APPLY_DETUNE_GLOBAL_KEY, v ? '1' : '0')
        } catch {
          /* ignore */
        }
      },
      { flush: 'sync' },
    )
  }

  return { actions, bindWatches }

}
