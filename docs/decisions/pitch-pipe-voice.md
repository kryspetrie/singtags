# Pitch pipe voice (accepted)

**Status:** accepted / implemented  
**Date:** 2026-09-03  

## Decision

Pitch pipe and pay-the-key tones use a **serializable voice preset** (`singtags.pitchPipeVoice.v1`): master gain, attack/release, oscillator partials (waveform, gain, semitone/cent offsets), optional biquad filter.

- **Production default:** classic 40% sawtooth + 60% sine (`classic-saw-sine`).
- **User default:** optional full JSON in `singtags.pitchPipeActiveVoice.v1`; change event `singtags:pitch-pipe-voice` syncs live players.
- **Labs:** `/labs/pitch-pipe-sound` edits/exports/imports presets, keeps a local candidate library (`singtags.pitchPipeVoiceLab.library.v1`), and can set the app default or email a preset to maintainers.

## Rejected for v1

- Shipping multiple hard-coded voices without a schema
- Server-side voice hosting (keep local until curated S3 is needed)
- Replacing the E3–E4 pad UX with a full virtual piano (tracked separately in [virtual-piano](../plans/virtual-piano.md))

## Notes

UI layout prefs (grid/list/piano, show octave) stay in `singtags.pitchPipe.v1` — separate from voice timbre.
