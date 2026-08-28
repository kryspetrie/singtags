# SingTags.com (barbershop-website)

Static Vue 3 + TypeScript site for a Barbershop Tags mirror. No backend — indexes and media are static (S3-ready).

## Layout

| Path | Purpose |
|---|---|
| `web/` | Vue SPA |
| `library/` | Working media mirror (**gitignored**) — lyric review progress in `library/_state/` |
| `sync/` | Mirror / enrich the library (audio tiers, sheets, lyrics reviewer, …) |
| `build/` | Build SPA indexes from `library/` (no media remux) |
| `deploy/` | Independent S3 pushes: website vs library |

## Docs

- [**Setup from zero** (Namecheap + Cloudflare)](docs/SETUP.md) — start here if you have no domain/hosting yet
- [Phased development plan](docs/PLAN.md)
- [Publish & deploy runbook](docs/PUBLISH.md)
- [**Search by Vibe** (planned)](docs/VIBE_SEARCH.md) — Workers AI spec
- [Architecture notes](docs/ARCHITECTURE.md)
- [Architecture decisions](docs/decisions/README.md) — sheet format, offline tiers
- [Feature pass plan](docs/FEATURE_PASS_PLAN.md) (Must/Should/Could from usability review)

## Quick start

```bash
# Library must exist locally (rsync from your mirror / extradrive copy)
python3 build/build_indexes.py

cd web
npm install
npm run dev
```

Vite serves `library/` at `/library`. Production builds register a service worker (PWA).

## Lyric review (preserve progress)

Progress lives in `library/_state/lyric_review_queue.json` (and related `lyric_*` files) plus finalized fields on each tag’s `metadata.json`. Continue with:

```bash
cd sync && source .venv/bin/activate  # after sync/install.sh
python lyrics/review_queue_gui.py
```

## Deploy (independent tracks)

```bash
# Website only (SPA + indexes)
S3_BUCKET=my-bucket ./deploy/website_s3.sh

# Library only (large; resumable)
S3_BUCKET=my-bucket ./deploy/library_s3.sh

./deploy/publish.sh website|library|all
```

See [docs/PUBLISH.md](docs/PUBLISH.md).
