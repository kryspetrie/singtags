# SingTags.com

<p align="center">
  <img src="docs/assets/logo.png" alt="SingTags" width="192" />
</p>

Static Vue 3 + TypeScript site for a Barbershop Tags mirror. No backend — indexes and media are static (S3-ready).

## Layout

| Path | Purpose |
|---|---|
| `web/` | Vue SPA |
| `library/` | Working media mirror (**gitignored**) |
| `sync/` | Mirror / enrich the library (audio tiers, sheets, lyrics, …) |
| `build/` | Build SPA indexes from `library/` (no media remux) |
| `deploy/` | Independent S3 pushes: website vs library |

## Docs

Full index: [docs/README.md](docs/README.md)

- [**Setup from zero**](docs/setup.md) — Namecheap + Cloudflare DNS + S3
- [Publish & deploy](docs/publish.md)
- [Status & open work](docs/status.md)
- [Architecture](docs/architecture.md)
- [Decisions](docs/decisions/README.md)
- Planned: [vibe search](docs/plans/vibe-search.md), [tag roulette](docs/plans/tag-roulette.md), [virtual piano](docs/plans/virtual-piano.md)

## Quick start

```bash
# Library must exist locally (rsync from your mirror / extradrive copy)
python3 build/build_indexes.py

cd web
npm install
npm run dev
```

Vite serves `library/` at `/library`. Production builds register a service worker (PWA).

## Deploy

```bash
S3_BUCKET=my-bucket ./deploy/website_s3.sh
S3_BUCKET=my-bucket ./deploy/library_s3.sh
./deploy/publish.sh website|library|all
```

See [docs/publish.md](docs/publish.md).
