# Pitch / speed bake pipeline (accepted)

**Status:** accepted  
**Date:** 2026-08-25  
**Plan:** [PITCH_SPEED_PLAN.md](../PITCH_SPEED_PLAN.md)

## Decision

Playback and downloads use a **bake-first** pipeline:

1. Decode once to `AudioBuffer` (session decode cache, revision-keyed).
2. Identity (`pitch=0`, `speed=1`) plays the original buffer immediately.
3. Non-identity transforms run in a **DedicatedWorker** on transferable `Float32Array` channels:
   - Time stretch: `@audio/stretch-wsola` (`factor = 1/speed`)
   - Pitch: `@audio/shift-formant` (`semitones`, actual `sampleRate`)
   - Order: stretch → pitch; output trimmed/padded to `expectedFrames`
4. Play via `AudioBufferSourceNode` with **`playbackRate = 1` always**.
5. Balance/solo/normalize stay in a live gain graph (mono duplicated to L/R).

## Rejected for v1

- `MediaElementAudioSourceNode` + `preservesPitch` (MES disables pitch preservation)
- Live FormantCorrection / SoundTouch worklet with `playbackRate ≠ 1`
- PSOLA stretch as default
- Silent fallback to coupled `playbackRate` when DSP fails

## Notes

WSOLA is speech-oriented; formant shift is voice-oriented. Quality on full polyphonic mixes may degrade at extreme ratios, but pitch and tempo remain independent by construction. WASM alternatives remain available if listening quality proves insufficient.
