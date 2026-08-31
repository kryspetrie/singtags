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
- Favorites, practice set, queue, recent, pitch pipe
- Offline library tiers + tiered Opus audio ([offline-library](decisions/offline-library.md), [audio-storage-cache](decisions/audio-storage-cache.md))
- Non-recombinable / `stereo_fallback` path ([non-recombinable-tracks](plans/non-recombinable-tracks.md) — residual spot-listen / optional H4)
- Sheet WebP + PDF originals ([sheets-format](decisions/sheets-format.md))
- S3 website + library deploy scripts

## Open

| Doc | Topic |
| --- | --- |
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
