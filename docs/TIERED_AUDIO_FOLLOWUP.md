# Tiered audio — follow-up plan (executed)

**Status:** Implemented (2026-08-26)  
**Parent:** [audio-storage-cache.md](decisions/audio-storage-cache.md)

## Clarifications (Phase 0)

| Topic | Decision |
| --- | --- |
| Offline part play (ultra solo) | Dual-mono stereo via `monoSoloToStereoObjectUrl` until full part-left reconstruct (v2) |
| Offline mix (`mono_solos`) | Never store mix blob at Ultra; reconstruct on first Mix play |
| Library pack | Always ultra-low paths from manifest — independent of starred storage quality |
| Star storage quality | Original / Playback (64k) / Ultra when publish tiers exist; Compact hidden |

## Implementation summary

- **Lazy resolve:** `useTagDetail` seeds starred blobs only; `resolvePart()` + TagPlayer `ensurePartUrl()` on first play
- **Lo-fi mix:** `storageAudioPath` returns `null` for mix on `mono_solos` tags
- **Ultra solo playback:** `resolveAudioPart` converts `.solo.opus` to dual-mono stereo
- **Download upgrade:** awaits `upgradeStarredAudioPart`, emits `cache-upgraded`, TagView reloads
- **Settings:** library vs starred copy; Compact hidden when manifest has Opus tiers
- **Docs:** `offline-library.md` updated for published-tier model

## Manual verification

See checklist in parent ADR § Manual test checklist.
