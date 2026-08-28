# Architecture decisions

Short records of choices that should not be re-litigated without new evidence.

| Decision | Status | Summary |
| --- | --- | --- |
| [Sheet format](sheets-format.md) | Accepted | Pre-rasterized WebP (+ original PDF); no DjVu |
| [Offline library](offline-library.md) | Accepted / implemented | Tiered device cache; audio is the bottleneck |
| [Audio storage & cache](audio-storage-cache.md) | Accepted / implemented | S3 tiers + lazy resolve + published Opus storage |
| [Non-recombinable tracks](../NON_RECOMBINABLE_TRACKS_PLAN.md) | Proposed | Flag bad stems/mix; host stereo Opus instead of solo reconstruct |
| [Pitch / speed playback](../PITCH_SPEED_PLAN.md) | Accepted | Bake-first WSOLA+formant; rate-1 BufferSource; live balance/solo |
| [Pitch / speed bake ADR](pitch-speed-bake.md) | Accepted | Selected pipeline + kill-list |
| [Tiered audio follow-up](../TIERED_AUDIO_FOLLOWUP.md) | Done | Lazy resolve, storage-quality fixes |

Related: [ARCHITECTURE.md](../ARCHITECTURE.md), [PUBLISH.md](../PUBLISH.md).
