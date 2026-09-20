# Architecture decisions

Short records of choices that should not be re-litigated without new evidence.

| Decision | Status | Summary |
| --- | --- | --- |
| [Sheet format](sheets-format.md) | Accepted | Pre-rasterized WebP (+ original PDF); no DjVu |
| [Offline library](offline-library.md) | Accepted / implemented | Tiered device cache; audio is the bottleneck |
| [Audio storage & cache](audio-storage-cache.md) | Accepted / implemented | S3 tiers + lazy resolve + published Opus |
| [Pitch / speed bake](pitch-speed-bake.md) | Accepted / implemented | Bake-first WSOLA+formant; rate-1 BufferSource |
| [Pitch pipe voice](pitch-pipe-voice.md) | Accepted / implemented | Configurable oscillator blend; Labs sound lab |
| [Tag Studio ports](tag-studio-ports.md) | Accepted / in progress | Domain → application → ports → adapters; schemas stay separate |

Related residual plan (not an ADR): [non-recombinable tracks](../plans/non-recombinable-tracks.md).  
Ports progress: [tag-studio-ports-readiness.md](../plans/tag-studio-ports-readiness.md).  
Also: [architecture.md](../architecture.md), [publish.md](../publish.md), [status.md](../status.md).
