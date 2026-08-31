# Architecture decisions

Short records of choices that should not be re-litigated without new evidence.

| Decision | Status | Summary |
| --- | --- | --- |
| [Sheet format](sheets-format.md) | Accepted | Pre-rasterized WebP (+ original PDF); no DjVu |
| [Offline library](offline-library.md) | Accepted / implemented | Tiered device cache; audio is the bottleneck |
| [Audio storage & cache](audio-storage-cache.md) | Accepted / implemented | S3 tiers + lazy resolve + published Opus |
| [Pitch / speed bake](pitch-speed-bake.md) | Accepted / implemented | Bake-first WSOLA+formant; rate-1 BufferSource |
| [Non-recombinable tracks](../plans/non-recombinable-tracks.md) | Mostly implemented | Flag bad stems/mix; host stereo Opus (residual ops) |

Related: [architecture.md](../architecture.md), [publish.md](../publish.md), [status.md](../status.md).
