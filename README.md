# SingTags.com

<p align="center">
  <img src="docs/assets/logo.png" alt="SingTags" width="192" />
</p>

**[www.singtags.com](https://www.singtags.com)** — a fast, offline-friendly barbershop tags library in the browser.

Static **Vue 3 + TypeScript** SPA. No app server: catalog indexes and media are published objects (S3 + Cloudflare DNS/HTTPS).

## What you can do

- **Browse & search** — title DSL, filters, lyrics (FTS), hybrid year bins, density scrub rail
- **Sing** — sheets (WebP + PDF), learning tracks, bake-first pitch/speed, pay-the-key, Sing mode fullscreen
- **Pitch pipe** — chromatic E3–E4 (and other ranges), grid/list/piano layouts, concert A / fine detune; Labs sound lab for custom voices
- **Offline** — favorites + songbook/audio packs, tiered Opus (online playback + WASM decode on older Safari)
- **Local Library** — your own charts/tracks on device (Labs), with optical (QR) transfer
- **Share & queue** — tag/collection QR, downloads queue, backup/restore

## Layout

| Path | Purpose |
| --- | --- |
| `web/` | Vue SPA (Vite + PWA) |
| `library/` | Working media (**gitignored**) — via [`sync/`](sync/README.md) |
| `sync/` | Mirror / enrich the library |
| `build/` | SPA indexes + offline manifests from `library/` |
| `deploy/` | S3 pushes: website vs library |

## Docs

Full index: [docs/README.md](docs/README.md)

- [**Contributing**](CONTRIBUTING.md) — tooling + pipeline + origin care
- [**Setup from zero**](docs/setup.md) — Namecheap + Cloudflare DNS + S3
- [Publish & deploy](docs/publish.md) — **when to rebuild indexes / publish**
- [Library mirror](sync/README.md)
- [Status & open work](docs/status.md)
- [Architecture](docs/architecture.md)

## Quick start

```bash
# Populate library/ via sync/ (or copy a workstation mirror), then:
python3 build/build_indexes.py
python3 build/build_offline_manifest.py   # if you care about offline packs

cd web
npm install
npm run dev
```

Vite serves `library/` at `/library`. Production builds register a service worker (PWA).

## Deploy

Rebuild indexes when the catalog changed, then:

```bash
./deploy/publish.sh library   # media
./deploy/publish.sh website   # SPA + indexes (does not run build_indexes)

# Or weekly (sync + indexes + both publishes → same bucket):
./deploy/weekly_prod.sh
```

See [docs/publish.md](docs/publish.md) and [sync/docs/WEEKLY_PROD_SYNC.md](sync/docs/WEEKLY_PROD_SYNC.md). Canonical host: **https://www.singtags.com**.
