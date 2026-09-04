# SingTags — project status

Working media lives in gitignored `library/`. Static Vue 3 + TypeScript SPA; catalog and media are published objects.

**Production:** [https://www.singtags.com](https://www.singtags.com) (Cloudflare → public S3 `singtags-prod`). Prefer **www**; apex should 301 → www if still proxied separately.

## Layout

| Path | Purpose |
| --- | --- |
| `web/` | Vue SPA (Vite + PWA) |
| `library/` | Working media mirror (**gitignored**) |
| `sync/` | Mirror / enrich `library/` |
| `build/` | SPA indexes + offline manifests from `library/` |
| `deploy/` | Independent S3 pushes: website vs library |

Contributing / pipeline: [../CONTRIBUTING.md](../CONTRIBUTING.md), [publish.md](publish.md).

## Shipped

### Browse & discovery

- Search DSL, chip filters, lyrics FTS (index reattaches after catalog refresh)
- Hybrid year bins, density scrub rail, full-list window virtualization
- Favorites, user collections, recent, downloads queue

### Tag experience

- Sheets: published WebP + PDF originals ([sheets-format](decisions/sheets-format.md))
- Learning tracks: bake-first pitch + speed ([pitch-speed-bake](decisions/pitch-speed-bake.md))
- Sing mode fullscreen; share links with session pitch/detune
- Pay-the-key + chromatic **pitch pipe** (grid / list / piano, concert A, fine detune, optional octave labels)
- Labs **pitch pipe sound lab** — schema `singtags.pitchPipeVoice.v1`, local library, user default voice ([pitch-pipe-voice](decisions/pitch-pipe-voice.md))

### Offline & media

- Offline library tiers + tiered Opus ([offline-library](decisions/offline-library.md), [audio-storage-cache](decisions/audio-storage-cache.md))
- Online playback prefers Opus; **WASM Ogg Opus decode** when Safari lacks native support
- Favorites/device cache at 64 kbps; backup/restore zip (prefs + packs)
- Non-recombinable / `stereo_fallback` path ([non-recombinable-tracks](plans/non-recombinable-tracks.md) — residual spot-listen)

### Local & transfer

- Local Library (on-device Entry+Assets, Labs flag)
- Optical (Decimen) transfer for local/ad-hoc files; catalog list buttons demoted

### Platform

- PWA install + “Update available” reload that always hard-refreshes
- Website deploy uploads **hashed `/assets` before `index.html`**
- Practice mode disabled (`PRACTICE_MODE_ENABLED`); custom favorites order remains

## Open

| Doc | Topic |
| --- | --- |
| [plans/vibe-search.md](plans/vibe-search.md) | Search by vibe (Workers AI) |
| [plans/tag-roulette.md](plans/tag-roulette.md) | Tag roulette discovery |
| [plans/virtual-piano.md](plans/virtual-piano.md) | Virtual piano (beyond pitch pipe) |
| [plans/local-library-transfer.md](plans/local-library-transfer.md) | Phase C: curated S3 local docs (deferred) |

## Ops residual

- Spot-listen calibration for non-recombinable demotion rates
- Keep Cloudflare apex → www redirect if apex is still proxied without Cloud Connector coverage

## Runbooks

- [../CONTRIBUTING.md](../CONTRIBUTING.md) — tooling + pipeline
- [setup.md](setup.md) — from zero
- [publish.md](publish.md) — deploy SSOT
- [architecture.md](architecture.md)
- [decisions/](decisions/README.md)
- [../sync/README.md](../sync/README.md) — library mirror
