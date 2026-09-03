# SingTags — project status

Working media lives in gitignored `library/`. Static Vue 3 + TypeScript SPA; catalog and media are published objects (S3-ready).

## Layout

| Path | Purpose |
| --- | --- |
| `web/` | Vue SPA |
| `library/` | Working media mirror (**gitignored**) |
| `sync/` | Mirror / enrich `library/` |
| `build/` | SPA indexes from `library/` (no remux) |
| `deploy/` | Independent S3 pushes: website vs library |

## Shipped

- Browse / search DSL, filters, hybrid year bins, density scrub rail
- Tag player with bake-first independent pitch + speed ([pitch-speed-bake](decisions/pitch-speed-bake.md))
- Favorites, collections, queue, recent, pitch pipe
- Offline library tiers + tiered Opus audio ([offline-library](decisions/offline-library.md), [audio-storage-cache](decisions/audio-storage-cache.md)); device favorites cache at 64 kbps
- Local Library (on-device Entry+Assets) + optical transfer for local/ad-hoc files
- Non-recombinable / `stereo_fallback` path ([non-recombinable-tracks](plans/non-recombinable-tracks.md) — residual spot-listen / optional H4)
- Sheet WebP + PDF originals ([sheets-format](decisions/sheets-format.md))
- S3 website + library deploy scripts

Practice mode is disabled (`PRACTICE_MODE_ENABLED`); custom favorites order remains.
## Open

| Doc | Topic |
| --- | --- |
| [plans/local-library-transfer.md](plans/local-library-transfer.md) | Local Library + optical Entry transfer (Phase C S3 deferred) |
| [plans/local-library-hardening.md](plans/local-library-hardening.md) | Implemented — groups, merge, receive placement/dedupe, honesty |
| [plans/product-honesty.md](plans/product-honesty.md) | Implemented — honesty copy + global detune everywhere |
| [plans/vibe-search.md](plans/vibe-search.md) | Search by vibe (Workers AI) |
| [plans/tag-roulette.md](plans/tag-roulette.md) | Tag roulette discovery |
| [plans/virtual-piano.md](plans/virtual-piano.md) | Virtual piano (pitch pipe stays) |

## Ops still open

- Full-library publish / CloudFront wiring for production
- Spot-listen calibration for non-recombinable demotion rates

## Runbooks

- [setup.md](setup.md) — from zero
- [publish.md](publish.md) — deploy
- [architecture.md](architecture.md)
- [decisions/](decisions/README.md)
