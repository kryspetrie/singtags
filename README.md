# SingTags.com (barbershop-website)

Static Vue 3 + TypeScript site for a Barbershop Tags mirror. No backend — indexes and media are static (S3-ready).

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
cd web
npm install
npm run dev
```

Production builds register a service worker (PWA). Use **Add to Home Screen** / install on mobile; open **Offline** settings to download songbook sheets (~300 MB full library) and star tags for audio. Airplane mode then works for browse + sheets + starred audio.

## Scripts

```bash
# Remux finalized tags → sample-data (MP4 AAC); default library on extradrive1
python3 scripts/seed_sample.py --limit 250 --force

# Rasterize sheets → WebP pages
python3 scripts/rasterize_sheets.py --force

# Build gzip indexes into web/public/indexes
python3 scripts/build_indexes.py

# Offline pack manifests (sheets + audio) for progressive PWA download
python3 scripts/build_offline_manifest.py

# Tests / coverage / Storybook (widget book)
cd web && npm test && npm run test:coverage
cd web && npm run storybook

# Deploy (copy .env.deploy.example → .env.deploy first)
./scripts/publish.sh s3       # Amazon S3 (+ optional CloudFront)
./scripts/publish.sh pages    # Cloudflare Pages
./scripts/publish.sh r2       # Cloudflare R2
```

See [docs/PUBLISH.md](docs/PUBLISH.md) for env vars and CloudFront / R2 setup. Offline PWA tiers: [docs/decisions/offline-library.md](docs/decisions/offline-library.md).

## Features in this tree

- Browse/search with **filter chips** (full text, sheet/audio, rating, key, arranger, …), **320ms debounce** on free text, inverted indexes, shareable URL
- Star from browse or tag page (IndexedDB, progress, metadata-only, refresh offline media) + export/import `starred.tags` with optional media fetch
- Mobile-first chrome: bottom tabs with badges, safe areas, installable **PWA** (service worker + install nudge)
- Tag page: next/prev in results, shareable key shift (`?shift=`), **fullscreen sheet** with floating pay-the-key, A–B loop, unified key ↔ pitch
- **Practice set** from Starred (reorder, auto-advance through tags)
- Recent tags on home; pitch pipe; zip download queue
- Storybook component gallery (`SingTags/*`)

## Layout

| Path | Purpose |
| --- | --- |
| `web/` | Vite + Vue 3 + TypeScript SPA |
| `docs/SETUP.md` | From-zero: Namecheap domain → Cloudflare → go live |
| `docs/VIBE_SEARCH.md` | Search by Vibe spec (Workers AI; planned) |
| `docs/decisions/` | ADRs (sheets, offline library) |
| `docs/PLAN.md` | Full phased plan |
| `docs/PUBLISH.md` | Local + full-library + S3 / Cloudflare deploy commands |
| `scripts/` | Seed, rasterize, indexes, S3 / Cloudflare deploy |
| `sample-data/` | 250-tag sample (metadata, sheets/WebP, MP4) |
